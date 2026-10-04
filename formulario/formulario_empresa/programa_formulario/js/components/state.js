(function () {
  function createAppState() {
    // Legacy module, not loaded by index.html. Authentication is server-side.
    const USERS = [];
    let currentUser = null;

    function findUser(user, pass) {
      return USERS.find(entry => entry.user === user && entry.pass === pass) || null;
    }

    function setUser(user) {
      currentUser = user || null;
    }

    function getUser() {
      return currentUser;
    }

    return {
      USERS,
      findUser,
      setUser,
      getUser,
    };
  }

  window.createAppState = createAppState;
})();
