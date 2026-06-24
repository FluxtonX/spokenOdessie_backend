const Memory = require("./memory.model");

const findByOwnerFirebaseUid = (ownerFirebaseUid) =>
  Memory.find({ ownerFirebaseUid }).sort({ updatedAt: -1 });

const findByOwnerAndPrivacy = (ownerFirebaseUid, allowedPrivacy) =>
  Memory.find({ ownerFirebaseUid, privacy: { $in: allowedPrivacy } }).sort({ updatedAt: -1 });

const findByIdAndOwnerFirebaseUid = (id, ownerFirebaseUid) =>
  Memory.findOne({ _id: id, ownerFirebaseUid });

const create = (payload) => Memory.create(payload);

const updateByIdAndOwnerFirebaseUid = (id, ownerFirebaseUid, payload) =>
  Memory.findOneAndUpdate({ _id: id, ownerFirebaseUid }, payload, {
    new: true,
    runValidators: true,
  });

const deleteByIdAndOwnerFirebaseUid = (id, ownerFirebaseUid) =>
  Memory.findOneAndDelete({ _id: id, ownerFirebaseUid });

module.exports = {
  findByOwnerFirebaseUid,
  findByOwnerAndPrivacy,
  findByIdAndOwnerFirebaseUid,
  create,
  updateByIdAndOwnerFirebaseUid,
  deleteByIdAndOwnerFirebaseUid,
};
