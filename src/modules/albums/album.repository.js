const Album = require("./album.model");

const findByOwnerFirebaseUid = (ownerFirebaseUid) =>
  Album.find({ ownerFirebaseUid }).sort({ createdAt: -1 }).lean();

const findByOwnerAndPrivacy = (ownerFirebaseUid, allowedPrivacy) =>
  Album.find({ ownerFirebaseUid, privacy: { $in: allowedPrivacy } })
    .sort({ createdAt: -1 })
    .lean();

const create = (payload) => Album.create(payload);

const findByIdAndOwnerFirebaseUid = (id, ownerFirebaseUid) =>
  Album.findOne({ _id: id, ownerFirebaseUid });

const addMemory = ({ albumId, ownerFirebaseUid, memory }) =>
  Album.findOneAndUpdate(
    { _id: albumId, ownerFirebaseUid },
    {
      $push: { memories: memory },
      $inc: { entries: 1 },
    },
    { new: true }
  );

const removeMemory = ({ albumId, ownerFirebaseUid, memoryId }) =>
  Album.findOneAndUpdate(
    { _id: albumId, ownerFirebaseUid },
    {
      $pull: { memories: { id: memoryId } },
      $inc: { entries: -1 },
    },
    { new: true }
  );

const updateMemory = ({ albumId, ownerFirebaseUid, memory }) =>
  Album.findOneAndUpdate(
    { _id: albumId, ownerFirebaseUid, "memories.id": memory.id },
    {
      $set: {
        "memories.$": memory,
      },
    },
    { new: true }
  );

module.exports = {
  findByOwnerFirebaseUid,
  findByOwnerAndPrivacy,
  create,
  findByIdAndOwnerFirebaseUid,
  addMemory,
  removeMemory,
  updateMemory,
};
