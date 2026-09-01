package service

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

func TestStartupWindowPolicyHidesDesktopUntilVaultIsSelected(t *testing.T) {
	withoutVault := startupWindowOptions(false, true, nil, nil)
	if withoutVault.Name != "desktop" || withoutVault.Pathname != "/home/index" || !withoutVault.Hidden {
		t.Fatalf("startup desktop without vault = %#v, want hidden /home/index window", withoutVault)
	}

	withVault := startupWindowOptions(true, true, nil, nil)
	if withVault.Hidden {
		t.Fatalf("startup desktop with vault = %#v, want visible window", withVault)
	}
}

func TestStartupWindowPolicyUsesPickerAsPrimaryWhenSecondaryWindowsAreUnsupported(t *testing.T) {
	options := startupWindowOptions(false, false, nil, nil)
	if options.Name != "vault-picker" || options.Pathname != "/vault-picker?primary=1" || options.Hidden {
		t.Fatalf("startup window without secondary-window support = %#v, want visible primary vault picker", options)
	}
}

func TestVaultPickerUsesDedicatedWindow(t *testing.T) {
	options := vaultPickerWindowOptions(false)
	if options.Name != "vault-picker" || options.Pathname != "/vault-picker" || options.EntryPage != "index.html" {
		t.Fatalf("vault picker options = %#v, want dedicated vault-picker window", options)
	}
	if options.Width != 760 || options.Height != 640 {
		t.Fatalf("vault picker size = %dx%d, want 760x640", options.Width, options.Height)
	}
}
