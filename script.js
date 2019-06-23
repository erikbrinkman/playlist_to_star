"use strict";
(async function() {

  const account = document.getElementById("account");
  const spotify = account.querySelector("button");
  const clear = document.getElementById("clear");
  const clearButton = clear.querySelector("button");
  const playlists = document.getElementById("playlists");
  const playlistUl = playlists.querySelector("ul");

  // Utils

  /** Get a url with given queries, but does not escape them. */
  function queryurl(base, options) {
    return base + "?" + Object.entries(options).map(
      ([key, val]) => `${key}=${val}`).join("&");
  }

  // Authentication

  let token = undefined;
  let autoLogout = undefined;

  // Real functions
  
  async function clearStarred() {
    clearButton.setAttribute("disabled", "");
    clearButton.removeEventListener("click", clearStarred);

    let next = queryurl("https://api.spotify.com/v1/me/tracks", {
      limit: 50,
    })
    const removals = [];
    while (next) {
      const info = await fetch(next, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).then(resp => resp.json());

      const ids = info.items.map(item => item.track.id);

      removals.push(fetch("https://api.spotify.com/v1/me/tracks", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ids),
      }));

      next = info.next;
    }

    // wait for removals to finish
    await Promise.all(removals);

    clearButton.addEventListener("click", clearStarred);
    clearButton.removeAttribute("disabled");
  }

  async function starPlaylistTracks(playlist) {
    let next = queryurl(`https://api.spotify.com/v1/playlists/${playlist}/tracks`, {
      limit: 50,  // could be 100 but would need fancier handling
      fields: "items.track.id,next",
    })
    const adds = [];
    while (next) {
      const info = await fetch(next, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).then(resp => resp.json());

      const ids = info.items.map(item => item.track.id);

      adds.push(fetch("https://api.spotify.com/v1/me/tracks", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ids),
      }));

      next = info.next;
    }

    await Promise.all(adds);
  }

  // Auth functions

  function earlyAuthentication() {
    console.error("unexpected authentication");
  }

  async function spotifyLogin() {
    spotify.setAttribute("disabled", "");
    spotify.removeEventListener("click", spotifyLogin);

    const randArray = new Uint8Array(8);
    crypto.getRandomValues(randArray);
    const state = btoa(String.fromCharCode(...randArray));
    const url = queryurl("https://accounts.spotify.com/authorize", {
      client_id: "d3406d1c378c440996b705c1f1eafa5e",
      response_type: "token",
      redirect_uri: encodeURIComponent(`${location.protocol}//${location.host}${location.pathname}auth.html`),
      state: encodeURIComponent(state),
      scope: "user-read-private user-library-read user-library-modify playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative",
    });

    try {
      token = await new Promise((resolve, reject) => {
        window.authenticate = (respState, access, expire, err) => {
          if (respState !== state) {
            reject("Authentication failed with improper state");
          } else if (err !== undefined) {
            reject(err);
          } else if (access === undefined || expire === undefined) {
            reject("Missing authentication information");
          } else {
            autoLogout = setTimeout(spotifyLogout, expire * 1000);
            resolve(access);
          }
        };
        const oauth = open(url, "Spotify Authentication", "toolbar=0,menubar=0");
        if (oauth === null) {
          reject("Failed to open authentication popup. This could indicate a popup blocker.");
        } else {
          oauth.focus();
          oauth.addEventListener("beforeunload", () => reject("Window closed without authenticating"));
        }
      });

      if (token === undefined) {
        throw new Error("token undefined");
      }

      const info = await fetch("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }).then(resp => resp.json());

      spotify.innerText = `Logout of ${info.display_name}`;

      clearButton.addEventListener("click", clearStarred);
      clear.style.opacity = 1;

      let next = queryurl("https://api.spotify.com/v1/me/playlists", {
        limit: 50,
      })
      while (next) {
        const info = await fetch(next, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }).then(resp => resp.json());

        info.items.forEach(playlist => {
          const container = document.createElement("div");
          container.classList.add("playlist");
          container.style.opacity = 0;

          const image = document.createElement("img");
          image.classList.add("image");
          image.src = playlist.images[0].url;
          container.appendChild(image);

          const name = document.createElement("div");
          name.classList.add("name");
          name.innerText = playlist.name;
          container.appendChild(name);

          container.addEventListener("click", async () => {
            container.setAttribute("disabled", "");
            await starPlaylistTracks(playlist.id);
            container.removeAttribute("disabled");
          });

          playlistUl.append(container);
          container.style.opacity = 1;
        });

        next = info.next;
      }

      spotify.addEventListener("click", spotifyLogout);
      spotify.removeAttribute("disabled");

    } catch (err) {
      spotifyLogout();
      throw err;
    } finally {
      window.authenticate = earlyAuthentication;
    }
  }

  /** Update state with a logged out status */
  function spotifyLogout() {
    spotify.setAttribute("disabled", "");
    spotify.removeEventListener("click", spotifyLogout);

    if (autoLogout !== undefined) {
      clearTimeout(autoLogout);
    }
    token = undefined;
    spotify.innerText = "Login";

    clearButton.removeEventListener("click", clearStarred);
    clear.style.opacity = 0;

    Array.from(playlistUl.children).forEach(node => node.remove());
    
    spotify.addEventListener("click", spotifyLogin);
    spotify.removeAttribute("disabled");
  }

  // Finish

  window.authenticate = earlyAuthentication;
  spotifyLogout();

})();
