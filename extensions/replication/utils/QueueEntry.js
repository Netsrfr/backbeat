'use strict'; // eslint-disable-line

const ObjectMD = require('arsenal').models.ObjectMD;
const VID_SEP = require('arsenal').versioning.VersioningConstants
          .VersionId.Separator;

class QueueEntry extends ObjectMD {

    /**
     * @constructor
     * @param {string} bucket - bucket name for entry's object (may be
     *   source bucket or destination bucket depending on replication
     *   status)
     * @param {string} objectKey - entry's object key without version
     *   suffix
     * @param {ObjectMD} objMd - entry's object metadata
     */
    constructor(bucket, objectKey, objMd) {
        super(objMd);
        this.bucket = bucket;
        this.objectKey = objectKey;
    }

    clone() {
        return new QueueEntry(this.bucket, this.objectKey, this);
    }

    checkSanity() {
        if (typeof this.bucket !== 'string') {
            return { message: 'missing bucket name' };
        }
        if (typeof this.objectKey !== 'string') {
            return { message: 'missing object key' };
        }
        return undefined;
    }

    static _extractVersionedBaseKey(key) {
        return key.split(VID_SEP)[0];
    }

    static createFromKafkaEntry(kafkaEntry) {
        try {
            const record = JSON.parse(kafkaEntry.value);
            const objMd = JSON.parse(record.value);
            const entry = new QueueEntry(
                record.bucket,
                QueueEntry._extractVersionedBaseKey(record.key),
                objMd);
            const err = entry.checkSanity();
            if (err) {
                return { error: err };
            }
            return entry;
        } catch (err) {
            return { error: { message: 'malformed JSON in kafka entry',
                              description: err.message } };
        }
    }

    getBucket() {
        return this.bucket;
    }

    setBucket(bucket) {
        this.bucket = bucket;
        return this;
    }

    getObjectKey() {
        return this.objectKey;
    }

    getLogInfo() {
        return {
            bucket: this.getBucket(),
            objectKey: this.getObjectKey(),
            versionId: this.getVersionId(),
            isDeleteMarker: this.getIsDeleteMarker(),
        };
    }

    toReplicaEntry() {
        const newEntry = this.clone();
        newEntry.setBucket(this.getReplicationTargetBucket());
        newEntry.setReplicationStatus('REPLICA');
        return newEntry;
    }

    toCompletedEntry() {
        const newEntry = this.clone();
        newEntry.setReplicationStatus('COMPLETED');
        return newEntry;
    }

    toFailedEntry() {
        const newEntry = this.clone();
        newEntry.setReplicationStatus('FAILED');
        return newEntry;
    }
}

module.exports = QueueEntry;
