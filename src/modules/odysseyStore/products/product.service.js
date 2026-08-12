const productRepository = require("./product.repository");

const getProducts = async (filters) => {
  return productRepository.findAll(filters);
};

const getProductBySlugOrId = async (identifier) => {
  const product = await productRepository.findBySlugOrId(identifier);
  if (!product) {
    const error = new Error("Product not found");
    error.statusCode = 404;
    throw error;
  }
  return product;
};

const createProduct = async (data) => {
  return productRepository.create(data);
};

const updateProduct = async (id, data) => {
  return productRepository.update(id, data);
};

const deleteProduct = async (id) => {
  return productRepository.deleteById(id);
};

module.exports = {
  getProducts,
  getProductBySlugOrId,
  createProduct,
  updateProduct,
  deleteProduct,
};
