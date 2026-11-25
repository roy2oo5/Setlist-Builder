package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"setlist-builder/backend/internal/database"
	"setlist-builder/backend/internal/models"
)

type userContextKey struct{}

func authenticationMiddleware(db *database.MongoDB, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/auth/unlock" {
			next.ServeHTTP(w, r)
			return
		}
		const prefix = "Bearer "
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, prefix) {
			writeError(w, http.StatusUnauthorized, errors.New("bearer token is required"))
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
		if token == "" {
			writeError(w, http.StatusUnauthorized, errors.New("bearer token is required"))
			return
		}
		user, err := db.GetSessionUser(r.Context(), token)
		if errors.Is(err, database.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, errors.New("invalid or expired session"))
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}

func userFromContext(ctx context.Context) (models.User, bool) {
	user, ok := ctx.Value(userContextKey{}).(models.User)
	return user, ok
}
