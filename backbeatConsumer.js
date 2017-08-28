const config = require('./conf/Config');
const BackbeatConsumer = require('./lib/BackbeatConsumer');

function processKafkaEntry(kafkaEntry, done) {
    process.stdout.write(`${kafkaEntry.value}\n`);
    return done();
}

const consumer = new BackbeatConsumer({
    zookeeper: config.zookeeper,
    topic: 'post_processing',
    groupId: config.extensions.replication.queueProcessor.groupId,
    concurrency: 1, // Process one entry at a time.
    queueProcessor: processKafkaEntry,
});

consumer.on('error', err => process.stdout.write(`${err}`));
consumer.subscribe();
