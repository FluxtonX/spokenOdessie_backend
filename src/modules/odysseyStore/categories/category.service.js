const categoryRepository = require("./category.repository");

const getCategories = async () => {
  return categoryRepository.findAll({ activeOnly: true });
};

const getCategoryBySlug = async (slug) => {
  const category = await categoryRepository.findBySlug(slug);
  if (!category) {
    const error = new Error("Category not found");
    error.statusCode = 404;
    throw error;
  }
  return category;
};

const createCategory = async (data) => {
  return categoryRepository.create(data);
};

const updateCategory = async (id, data) => {
  return categoryRepository.update(id, data);
};

const deleteCategory = async (id) => {
  return categoryRepository.deleteById(id);
};

module.exports = {
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
};
