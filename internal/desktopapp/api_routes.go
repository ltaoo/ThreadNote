package desktopapp

import (
	"github.com/ltaoo/velo"
	updater "github.com/ltaoo/velo/updater/api"
	"github.com/rs/zerolog"
)

func registerRoutes(b *velo.Box, logger *zerolog.Logger, appUpdater *updater.AppUpdater, inputSourceLock *InputSourceLockService, memoAgent *memoAgentService) {
	registerVaultProjectMemoRoutes(b)
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
	registerUpdateAndWindowRoutes(b, appUpdater)
}
