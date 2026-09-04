package service

import (
	"strings"

	"github.com/ltaoo/velo"
)

type credential_password_request struct {
	Password string `json:"password"`
}

type credential_item_request struct {
	ID string `json:"id"`
}

type credential_field_request struct {
	FieldID string `json:"fieldId"`
	ItemID  string `json:"itemId"`
}

func register_credential_routes(box *velo.Box) {
	box.Get("/api/credentials/status", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		initialized, unlocked, err := credential_status(vault_ctx)
		if err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{
			"autoLockSeconds": int(credential_auto_lock_duration.Seconds()),
			"initialized":     initialized,
			"unlocked":        unlocked,
		})
	})

	box.Post("/api/credentials/setup", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		var request credential_password_request
		if err := context.BindJSON(&request); err != nil {
			return context.Error(err.Error())
		}
		if err := credential_setup(vault_ctx, request.Password); err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"unlocked": true})
	})

	box.Post("/api/credentials/unlock", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		var request credential_password_request
		if err := context.BindJSON(&request); err != nil {
			return context.Error(err.Error())
		}
		if err := credential_unlock(vault_ctx, request.Password); err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"unlocked": true})
	})

	box.Post("/api/credentials/lock", func(context *velo.BoxContext) interface{} {
		credential_session_lock()
		return context.Ok(velo.H{"unlocked": false})
	})

	box.Get("/api/credentials", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		items, err := credential_list_items(vault_ctx, context.Query("q"), context.Query("type"))
		if err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"items": items})
	})

	for route, include_secrets := range map[string]bool{
		"/api/credentials/get":  false,
		"/api/credentials/edit": true,
	} {
		route := route
		include_secrets := include_secrets
		box.Post(route, func(context *velo.BoxContext) interface{} {
			vault_ctx, err := requireActiveVault()
			if err != nil {
				return context.Error(err.Error())
			}
			var request credential_item_request
			if err := context.BindJSON(&request); err != nil {
				return context.Error(err.Error())
			}
			item, err := credential_get_item(vault_ctx, request.ID, include_secrets)
			if err != nil {
				return context.Error(err.Error())
			}
			return context.Ok(velo.H{"item": item})
		})
	}

	box.Post("/api/credentials/reveal", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		var request credential_field_request
		if err := context.BindJSON(&request); err != nil {
			return context.Error(err.Error())
		}
		value, err := credential_reveal_field(vault_ctx, request.ItemID, request.FieldID)
		if err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"value": value})
	})

	box.Post("/api/credentials/save", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		var item CredentialItem
		if err := context.BindJSON(&item); err != nil {
			return context.Error(err.Error())
		}
		saved, err := credential_save_item(vault_ctx, item)
		if err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"item": saved})
	})

	box.Post("/api/credentials/delete", func(context *velo.BoxContext) interface{} {
		vault_ctx, err := requireActiveVault()
		if err != nil {
			return context.Error(err.Error())
		}
		var request credential_item_request
		if err := context.BindJSON(&request); err != nil {
			return context.Error(err.Error())
		}
		if strings.TrimSpace(request.ID) == "" {
			return context.Error("credential item ID is required")
		}
		if err := credential_delete_item(vault_ctx, request.ID); err != nil {
			return context.Error(err.Error())
		}
		return context.Ok(velo.H{"success": true})
	})
}
