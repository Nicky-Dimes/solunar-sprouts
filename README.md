# Solunar Sprouts

A pixel-art pet-raising game for iPhone and iPad, installed from Safari as a Home Screen app.

This folder is the **built site**. Don't edit files here by hand. The game source lives in `../pocket-sprout/`, and
`python3 ../tools/build_web.py` rebuilds this folder (it keeps this README).

## One-time setup (about 10 minutes)

1. Make a free account at https://github.com and install **GitHub Desktop** from https://desktop.github.com.
2. In GitHub Desktop, choose **File › Add Local Repository…** and pick this `solunar-sprouts` folder.
   Type "First version" in the summary box, click **Commit to main**, then click **Publish repository**.
   Keep the name `solunar-sprouts` and untick **Keep this code private**: free GitHub Pages sites need a public
   repository.
3. On github.com, open the repository, then **Settings › Pages**. Under **Build and deployment** choose
   **Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
4. After a minute or two the page shows your address, like `https://<your-name>.github.io/solunar-sprouts/`.

## Installing on each iPhone or iPad

1. Open the address in **Safari** (not Chrome or another browser).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Launch the game from the new **Solunar** icon from now on. Progress saved in the Home Screen app is separate from
   Safari, so always use the icon.
4. The game opens on a main menu that asks **Who's playing?**. Each child taps their own card, or **New player** to
   start their own garden. In the game, tap the name in the top-left corner to get back to the menu.

## Publishing an update

1. Ask Claude to make changes; Claude runs `python3 tools/build_web.py`, which refreshes this folder.
   Before building, it runs `tools/check_game.js`: every script must load, every egg/look/icon must draw, and old,
   current and damaged saves must load without losing progress. If anything fails, the build stops and nothing here changes.
2. In GitHub Desktop, write a short summary (e.g. "New animals"), click **Commit to main**, then **Push origin**.
3. Within a few minutes, open phones see "A new version is ready" (or get it the next time the app is opened).
   Saves are kept: they live on each device and don't change when the game files do.

## Keeping progress safe

- **Sprouts › Backups** (also on the main menu) makes a backup code for one player or all players. Save it in Notes,
  Files or an email. If a phone is replaced, reset or its website data is cleared, paste the code into **Restore**.
  "Restore as new player" adds the game alongside the others; "Replace …'s game" swaps it in for the current player.
- The main menu reminds you when a player hasn't been backed up for two weeks.
- **Automatic backups:** each device also keeps the last three days' saves of every player on its own. If a saved game
  ever can't be opened, the game brings back the newest automatic backup, keeps a copy of the damaged save, and tells
  you. You can also go back to an earlier day from **Backups › Automatic backups on this device**. (These live on the
  device, so they don't replace backup codes for a lost or reset phone.)
- If the phone refuses to save (storage full, website data blocked), the game shows a warning for grown-ups.
- Parent-only actions (testing shortcuts, erasing, removing or replacing a game) ask a quick maths question first.
  A right answer unlocks them for two minutes, and they lock again as soon as the app is put away.

## Good to know

- The game works offline after its first launch.
- Deleting the Home Screen icon deletes that app's saved games too, so back up first.
- Changing the site's address (for example renaming the repository) starts saves from scratch on each phone,
  because saves belong to the address. Restore from backup codes if that ever happens.
