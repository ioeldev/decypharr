package customerror

// CacheRejection carries the identity parsed by the download endpoint, not an
// untrusted hash supplied separately by the caller.
type CacheRejection struct {
	InfoHash string
	Err      error
}

func (e *CacheRejection) Error() string { return e.Err.Error() }
func (e *CacheRejection) Unwrap() error { return e.Err }
