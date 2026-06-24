const albumService = require("./album.service");

const getAlbums = async (req, res) => {
  try {
    const albums = await albumService.getAlbumsByUser(req.user, req.query.userId);

    res.status(200).json({
      success: true,
      data: albums,
    });
  } catch (error) {
    console.error("Get Albums Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch albums",
    });
  }
};

const createAlbum = async (req, res) => {
  try {
    const album = await albumService.createAlbum({
      user: req.user,
      title: req.body.title,
      subtitle: req.body.subtitle,
      privacy: req.body.privacy,
      coverUrl: req.body.coverUrl,
      file: req.file,
    });

    res.status(201).json({
      success: true,
      data: album,
    });
  } catch (error) {
    console.error("Create Album Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create album",
    });
  }
};

const updateAlbum = async (req, res) => {
  try {
    const album = await albumService.updateAlbum({
      user: req.user,
      albumId: req.params.id,
      title: req.body.title,
      subtitle: req.body.subtitle,
      privacy: req.body.privacy,
      coverUrl: req.body.coverUrl,
      file: req.file,
    });

    res.status(200).json({
      success: true,
      data: album,
    });
  } catch (error) {
    console.error("Update Album Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update album",
    });
  }
};

const getAlbumDetails = async (req, res) => {
  try {
    const album = await albumService.getAlbumDetails({
      currentUser: req.user,
      albumId: req.params.id,
    });

    res.status(200).json({
      success: true,
      data: album,
    });
  } catch (error) {
    console.error("Get Album Details Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch album details",
    });
  }
};

module.exports = {
  getAlbums,
  createAlbum,
  updateAlbum,
  getAlbumDetails,
};
