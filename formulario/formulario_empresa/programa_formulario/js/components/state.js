(function () {
  function createAppState() {
    const USERS = [
      { user: 'usuario1', pass: '1234', nombre: 'Usuario 1' },
      { user: 'usuario2', pass: '1234', nombre: 'Usuario 2' },
      { user: 'usuario3', pass: '1234', nombre: 'Usuario 3' },
    ];
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
