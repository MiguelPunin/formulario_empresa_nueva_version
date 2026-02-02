(function () {
  function createAuthComponent(options) {
    const {
      loginOverlay,
      loginBtn,
      loginClear,
      loginUser,
      loginPass,
      loginError,
      userChip,
      userNameLabel,
      logoutBtn,
      state,
      onLogin,
    } = options;

    function setLoggedIn(user) {
      loginOverlay.classList.add('hidden');
      userChip.style.display = 'inline-flex';
      userNameLabel.textContent = user.nombre || user.user;
      loginError.textContent = '';
    }

    function setLoggedOut() {
      loginOverlay.classList.remove('hidden');
      userChip.style.display = 'none';
    }

    function login() {
      const u = loginUser.value.trim();
      const p = loginPass.value;
      const found = state.findUser(u, p);
      if (!found) {
        loginError.textContent = 'Usuario o contraseña incorrectos';
        return;
      }
      state.setUser(found);
      sessionStorage.setItem('loggedUser', JSON.stringify(found));
      setLoggedIn(found);
      if (typeof onLogin === 'function') onLogin();
    }

    function logout() {
      state.setUser(null);
      sessionStorage.removeItem('loggedUser');
      setLoggedOut();
      loginUser.focus();
    }

    function clearLogin() {
      loginUser.value = '';
      loginPass.value = '';
      loginError.textContent = '';
      loginUser.focus();
    }

    function restoreSession() {
      const saved = sessionStorage.getItem('loggedUser');
      if (!saved) {
        setLoggedOut();
        return;
      }
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.user) {
          const match = state.findUser(parsed.user, parsed.pass);
          if (match) {
            state.setUser(match);
            setLoggedIn(match);
            return;
          }
        }
      } catch (err) {
        // Ignore parse issues and clear session below.
      }
      sessionStorage.removeItem('loggedUser');
      setLoggedOut();
    }

    function bind() {
      if (loginBtn) loginBtn.addEventListener('click', login);
      if (logoutBtn) logoutBtn.addEventListener('click', logout);
      if (loginClear) loginClear.addEventListener('click', clearLogin);
      if (loginPass) {
        loginPass.addEventListener('keyup', (e) => { if (e.key === 'Enter') login(); });
      }
      if (loginUser) {
        loginUser.addEventListener('keyup', (e) => { if (e.key === 'Enter') login(); });
      }
    }

    return {
      login,
      logout,
      restoreSession,
      bind,
    };
  }

  window.createAuthComponent = createAuthComponent;
})();
