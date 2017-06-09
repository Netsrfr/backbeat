const async = require('async');
const schedule = require('node-schedule');

const errors = require('arsenal').errors;
const replicatorApi = require('./replicatorApi');
const Logger = require('werelogs').Logger;
const logger = new Logger('Backbeat:Replication:QueuePopulator',
                          { level: 'info', dump: 'error' });
const log = logger.newRequestLogger();

// FIXME: should be from config object
const raftConfig = {
    repds: [
        { host: '172.17.0.2', adminPort: 4205 },
        { host: '172.17.0.2', adminPort: 4206 },
        { host: '172.17.0.2', adminPort: 4207 },
        { host: '172.17.0.2', adminPort: 4208 },
        { host: '172.17.0.2', adminPort: 4209 },
    ],
};

const zookeeperConfig = { host: 'localhost', port: 2181 };
const bucketFileConfig = { host: '172.17.0.2', port: 9990 };

const replicationConfig = {
    source: {
        s3backend: 'file',
        s3backendConfig: bucketFileConfig,
    },
    cronRule: '*/5 * * * * *',
    batchMaxRead: 10000,
};


/* eslint-disable no-param-reassign */
function queueBatch(replicatorState, taskState) {
    if (taskState.batchInProgress) {
        log.warn('skipping replication batch: ' +
                 'previous one still in progress');
        return undefined;
    }
    log.debug('start queueing replication batch');
    taskState.batchInProgress = true;
    replicatorApi.processAllLogEntries(
        replicatorState, { maxRead: replicationConfig.batchMaxRead },
        log, (err, counters) => {
            if (err) {
                log.error('an error occurred during replication',
                          { error: err, errorStack: err.stack });
            } else {
                const logFunc = (counters.read > 0 ? log.info : log.debug)
                          .bind(log);
                logFunc('replication batch finished', { counters });
            }
            taskState.batchInProgress = false;
        });
    return undefined;
}
/* eslint-enable no-param-reassign */

async.waterfall([
    done => {
        const sourceConfig = replicationConfig.source;
        const backendConfig = sourceConfig.s3backendConfig;
        switch (sourceConfig.s3backend) {
        case 'file':
            replicatorApi.openBucketFileLog(backendConfig, log, done);
            break ;
        case 'scality':
            replicatorApi.openRaftLog(backendConfig, 0, log, done);
            break ;
        default:
            log.error('expect s3backend type to be "scality" or "file"');
            done(errors.InternalError);
        }
    }, (logState, done) => {
        replicatorApi.createReplicator(logState, zookeeperConfig, log, done);
    }, (replicatorState, done) => {
        const taskState = {
            batchInProgress: false,
        };
        schedule.scheduleJob(replicationConfig.cronRule, () => {
            queueBatch(replicatorState, taskState);
        });
        done();
    },
], err => {
    if (err) {
        log.error('error during replicator initialization', { error: err });
        process.exit(1);
    }
});