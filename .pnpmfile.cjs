// Allow build scripts for specific packages
module.exports = {
  hooks: {
    readPackage(pkg) {
      return pkg;
    }
  }
};
