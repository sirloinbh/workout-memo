# #6 Project-specific GitHub authentication

- Issue: https://github.com/sirloinbh/workout-memo/issues/6
- Branch: chore/6-project-github-auth

## Work commit: chore: 프로젝트 전용 GitHub 인증 환경 분리 (#6) (separate the project-specific GitHub authentication environment)

The VS Code environment and terminal profile, the gh wrapper, the account B launch script, and the local Git helper are connected to a dedicated settings folder. Even when the active account in the shared keychain changes, only the explicit sirloinbh account token is used, in process memory. The default gh settings and the global Git settings are preserved. The desktop launcher is backed up to .local and installed as an independent copy with the project path applied. The Git helper and the terminal initialization script also use copies in the user settings folder, so a branch change does not affect them.

Eight related behavior tests were written and run together with the implementation, and pass 8, fail 0, skip 0 were confirmed. They verify the settings path, the explicit account, replacing inherited tokens, arguments, failure codes, Git stdin, environment restoration, the other-project branch, and the terminal function. At first they failed because of an error selecting among several gh executables, and passed after the fix of picking the first executable. It was also confirmed, without printing the credentials, that the owner of the real CLI api user and of the Git helper token is sirloinbh. The username the Git helper shows is x-access-token, and the real account of the token was checked separately. The SHA-256 match between source and installed copy was confirmed. App code, DB, and AWS deployment are not changed. The user merges directly.

## Work commit: fix: 프로젝트 VS Code 프로세스 환경도 분리 (#6) (also separate the project VS Code process environment)

Windows that use the same VS Code user data folder can share the environment of the first process, so the project window now uses VSCode-Account-B-workout-memo. Launches from other folders keep the existing VSCode-Account-B, and CODEX_HOME also keeps the existing account B. The launcher test also verifies the user data argument for the project and for other folders.

The 8 related tests were re-run, and the desktop copy is updated the same way. The existing user data folder is not changed, and the editor's personal settings may need to be applied separately in the new project window.
