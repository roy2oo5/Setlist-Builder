package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"setlist-builder/backend/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

const adminIssuer = "stagechord-admin"

func requireAdmin(cfg config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeError(w, http.StatusUnauthorized, errors.New("bearer token required"))
			return
		}
		tokenString := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, errors.New("unexpected signing method")
			}
			return []byte(cfg.JWTSecret), nil
		},
			jwt.WithIssuer(adminIssuer),
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		)
		if err != nil || !token.Valid {
			writeError(w, http.StatusUnauthorized, errors.New("invalid or expired token"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func adminLoginHandler(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			PIN string `json:"pin"`
		}
		if err := decodeJSON(r, &input); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		if len(input.PIN) != 4 {
			writeError(w, http.StatusUnauthorized, errors.New("invalid PIN"))
			return
		}
		pinHash := sha256.Sum256([]byte(input.PIN))
		adminHash := sha256.Sum256([]byte(cfg.AdminPIN))
		valid := subtle.ConstantTimeCompare(pinHash[:], adminHash[:]) == 1
		if !valid {
			writeError(w, http.StatusUnauthorized, errors.New("invalid PIN"))
			return
		}
		now := time.Now()
		claims := jwt.RegisteredClaims{
			Issuer:    adminIssuer,
			Subject:   "band-admin",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(7 * 24 * time.Hour)),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := token.SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"token": signed})
	}
}
