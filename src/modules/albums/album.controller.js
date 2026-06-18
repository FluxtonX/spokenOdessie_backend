const albumService = require("./album.service");

const getAlbums = async (req, res) => {
  try {
    const albums = await albumService.getAlbumsByUser(req.user);

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

module.exports = {
  getAlbums,
  createAlbum,
};
