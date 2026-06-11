# Reproducible build of the Reeg attestation enclave. Alpine is musl-native, so `cargo build`
# produces the static binary the enclave runs as init. Pin the base image by DIGEST (not just the
# tag) so the enclave's PCRs are stable across rebuilds — record the digest in enclave/README after
# the first build and replace the tag below with `rust:1.83-alpine3.21@sha256:<digest>`.
FROM rust:1.90-alpine3.22 AS builder
RUN apk add --no-cache musl-dev
WORKDIR /build
# Copy the manifest + lockfile first so `--locked` pins exact dependency versions (reproducibility).
COPY Cargo.toml Cargo.lock ./
COPY src ./src
# Reproducibility: SOURCE_DATE_EPOCH zeroes build timestamps; --remap-path-prefix strips the embedded
# build + cargo registry paths from the binary; codegen-units=1 + strip + panic=abort (Cargo.toml)
# make codegen deterministic; then pin the binary's mtime so the enclave filesystem (and thus PCR0)
# does not vary with build time.
ENV SOURCE_DATE_EPOCH=0
ENV RUSTFLAGS="--remap-path-prefix=/build=/reeg --remap-path-prefix=/usr/local/cargo=/cargo"
RUN cargo build --release --locked && \
    touch --no-dereference --date=@0 /build/target/release/reeg-enclave

# Minimal final image: just the static init binary. A smaller, fixed filesystem => stable PCRs.
FROM scratch
COPY --from=builder /build/target/release/reeg-enclave /reeg-enclave
ENTRYPOINT ["/reeg-enclave"]
