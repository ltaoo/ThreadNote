package desktopapp

import (
	"testing"

	"github.com/ltaoo/velo"
)

func TestVeloAppDoesNotCreateExecutableLocalStore(t *testing.T) {
	app := velo.NewApp(&velo.VeloAppOpt{
		Mode:               velo.ModeBridge,
		EnableLocalStorage: false,
	})
	if app.Store != nil {
		t.Fatal("Velo created a store beside the executable while local storage was disabled")
	}
}
