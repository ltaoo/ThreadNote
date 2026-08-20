package desktopapp

import (
	"github.com/ltaoo/velo"
	"github.com/rs/zerolog"
)

func registerRoutes(b *velo.Box, logger *zerolog.Logger, appUpdater *application_updater, inputSourceLock *InputSourceLockService, memoAgent *memoAgentService) {
	registerVaultProjectMemoRoutes(b)
	register_vault_sync_routes(b)
	registerTaskRoutes(b)
	registerGTDRoutes(b)
	registerBoardRoutes(b)
	registerHookRoutes(b)
	registerLinkRoutes(b)
	registerSnippetRoutes(b)
	registerDesktopRoutes(b, logger)
	registerStorageRoutes(b)
	registerAutoStartRoutes(b)
	registerInputSourceLockRoutes(b, inputSourceLock)
	registerClipboardRoutes(b, logger)
	registerMemoAgentRoutes(b, memoAgent)
	register_update_and_window_routes(b, appUpdater)
}
