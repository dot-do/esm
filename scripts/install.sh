#!/usr/bin/env bash
#
# esm.do CLI Universal Installer
#
# Usage:
#   curl -fsSL https://esm.do/install | bash
#   curl -fsSL https://esm.do/install | bash -s -- --npm
#   curl -fsSL https://esm.do/install | bash -s -- --homebrew
#
# Environment variables:
#   ESM_INSTALL_DIR    - Installation directory (default: ~/.esm/bin)
#   ESM_VERSION        - Specific version to install (default: latest)
#   ESM_NO_MODIFY_PATH - Set to 1 to skip PATH modification
#

set -euo pipefail

# Configuration
VERSION="${ESM_VERSION:-latest}"
INSTALL_DIR="${ESM_INSTALL_DIR:-$HOME/.esm/bin}"
PACKAGE_NAME="esm.do"
GITHUB_REPO="dot-do/esm"
NPM_REGISTRY="https://registry.npmjs.org"

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    NC=''
fi

# Logging functions
log_info() {
    echo -e "${BLUE}info${NC}: $1"
}

log_success() {
    echo -e "${GREEN}success${NC}: $1"
}

log_warn() {
    echo -e "${YELLOW}warning${NC}: $1"
}

log_error() {
    echo -e "${RED}error${NC}: $1" >&2
}

log_step() {
    echo -e "${BOLD}==>${NC} $1"
}

# Detect operating system
detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux" ;;
        Darwin*)    echo "macos" ;;
        CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

# Detect CPU architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64)    echo "x64" ;;
        aarch64|arm64)   echo "arm64" ;;
        armv7l|armv8l)   echo "arm" ;;
        *)               echo "unknown" ;;
    esac
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running in WSL
is_wsl() {
    if [ -f /proc/version ]; then
        grep -qi microsoft /proc/version 2>/dev/null && return 0
    fi
    return 1
}

# Get the latest version from npm
get_latest_version() {
    if command_exists curl; then
        curl -sS "$NPM_REGISTRY/$PACKAGE_NAME" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4
    elif command_exists wget; then
        wget -qO- "$NPM_REGISTRY/$PACKAGE_NAME" | grep -o '"version":"[^"]*"' | head -1 | cut -d'"' -f4
    else
        log_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi
}

# Install via npm (global)
install_npm() {
    log_step "Installing via npm..."

    if ! command_exists npm; then
        log_error "npm is not installed. Please install Node.js first."
        log_info "Visit https://nodejs.org/ or use your package manager."
        exit 1
    fi

    # Check Node.js version
    node_version=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js 18 or later is required. Current version: $(node --version)"
        exit 1
    fi

    if [ "$VERSION" = "latest" ]; then
        npm install -g "$PACKAGE_NAME"
    else
        npm install -g "$PACKAGE_NAME@$VERSION"
    fi

    log_success "esm.do CLI installed via npm"
}

# Install via Homebrew
install_homebrew() {
    log_step "Installing via Homebrew..."

    if ! command_exists brew; then
        log_error "Homebrew is not installed."
        log_info "Install Homebrew: https://brew.sh"
        exit 1
    fi

    # Add tap if not already added
    if ! brew tap | grep -q "dot-do/esm"; then
        log_info "Adding dot-do/esm tap..."
        brew tap dot-do/esm https://github.com/dot-do/esm 2>/dev/null || true
    fi

    brew install esm-do

    log_success "esm.do CLI installed via Homebrew"
}

# Install binary directly
install_binary() {
    local os="$1"
    local arch="$2"

    log_step "Installing binary for $os-$arch..."

    # Determine version
    if [ "$VERSION" = "latest" ]; then
        VERSION=$(get_latest_version)
        if [ -z "$VERSION" ]; then
            log_error "Could not determine latest version"
            exit 1
        fi
        log_info "Latest version: $VERSION"
    fi

    # Create installation directory
    mkdir -p "$INSTALL_DIR"

    # For now, fall back to npm if binary not available
    log_warn "Binary distribution not yet available. Falling back to npm."
    install_npm
    return

    # Future: Download and extract binary
    # local binary_url="https://github.com/$GITHUB_REPO/releases/download/v$VERSION/esm-$os-$arch.tar.gz"
    # local tmp_dir=$(mktemp -d)
    #
    # if command_exists curl; then
    #     curl -fsSL "$binary_url" | tar -xz -C "$tmp_dir"
    # elif command_exists wget; then
    #     wget -qO- "$binary_url" | tar -xz -C "$tmp_dir"
    # fi
    #
    # mv "$tmp_dir/esm" "$INSTALL_DIR/esm"
    # chmod +x "$INSTALL_DIR/esm"
    # rm -rf "$tmp_dir"
}

# Add to PATH
add_to_path() {
    if [ "${ESM_NO_MODIFY_PATH:-0}" = "1" ]; then
        log_info "Skipping PATH modification (ESM_NO_MODIFY_PATH=1)"
        return
    fi

    # Check if already in PATH
    if echo "$PATH" | tr ':' '\n' | grep -q "^$INSTALL_DIR$"; then
        return
    fi

    local shell_name=$(basename "$SHELL")
    local profile_file=""

    case "$shell_name" in
        bash)
            if [ -f "$HOME/.bashrc" ]; then
                profile_file="$HOME/.bashrc"
            elif [ -f "$HOME/.bash_profile" ]; then
                profile_file="$HOME/.bash_profile"
            fi
            ;;
        zsh)
            profile_file="$HOME/.zshrc"
            ;;
        fish)
            profile_file="$HOME/.config/fish/config.fish"
            ;;
        *)
            profile_file="$HOME/.profile"
            ;;
    esac

    if [ -n "$profile_file" ]; then
        log_info "Adding $INSTALL_DIR to PATH in $profile_file"

        if [ "$shell_name" = "fish" ]; then
            echo "set -gx PATH \"$INSTALL_DIR\" \$PATH" >> "$profile_file"
        else
            echo "" >> "$profile_file"
            echo "# esm.do CLI" >> "$profile_file"
            echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$profile_file"
        fi

        log_info "Please restart your shell or run: source $profile_file"
    fi
}

# Verify installation
verify_installation() {
    log_step "Verifying installation..."

    # Try to find esm command
    if command_exists esm; then
        local installed_version=$(esm --version 2>/dev/null || echo "unknown")
        log_success "esm.do CLI v$installed_version is now available!"
        return 0
    fi

    # Check in custom install dir
    if [ -x "$INSTALL_DIR/esm" ]; then
        log_success "esm.do CLI installed to $INSTALL_DIR"
        log_warn "Add $INSTALL_DIR to your PATH to use the 'esm' command"
        return 0
    fi

    log_error "Installation verification failed"
    return 1
}

# Print usage
print_usage() {
    cat << EOF
esm.do CLI Installer

Usage:
    curl -fsSL https://esm.do/install | bash [options]

Options:
    --npm           Install via npm (default on most systems)
    --homebrew      Install via Homebrew (macOS/Linux)
    --binary        Install pre-built binary
    --version=X.Y.Z Install specific version
    --help          Show this help message

Environment Variables:
    ESM_INSTALL_DIR     Installation directory (default: ~/.esm/bin)
    ESM_VERSION         Specific version to install
    ESM_NO_MODIFY_PATH  Set to 1 to skip PATH modification

Examples:
    # Install latest version
    curl -fsSL https://esm.do/install | bash

    # Install specific version
    curl -fsSL https://esm.do/install | bash -s -- --version=0.1.0

    # Install via Homebrew
    curl -fsSL https://esm.do/install | bash -s -- --homebrew

EOF
}

# Main function
main() {
    local install_method=""

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --npm)
                install_method="npm"
                ;;
            --homebrew)
                install_method="homebrew"
                ;;
            --binary)
                install_method="binary"
                ;;
            --version=*)
                VERSION="${arg#*=}"
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $arg"
                print_usage
                exit 1
                ;;
        esac
    done

    # Detect environment
    local os=$(detect_os)
    local arch=$(detect_arch)

    echo ""
    echo -e "${BOLD}esm.do CLI Installer${NC}"
    echo "========================================"
    log_info "OS: $os"
    log_info "Architecture: $arch"
    if is_wsl; then
        log_info "Environment: WSL"
    fi
    echo ""

    # Determine installation method if not specified
    if [ -z "$install_method" ]; then
        case "$os" in
            macos)
                if command_exists brew; then
                    install_method="homebrew"
                elif command_exists npm; then
                    install_method="npm"
                else
                    install_method="binary"
                fi
                ;;
            linux)
                if command_exists npm; then
                    install_method="npm"
                elif command_exists brew; then
                    install_method="homebrew"
                else
                    install_method="binary"
                fi
                ;;
            windows)
                if command_exists npm; then
                    install_method="npm"
                else
                    log_error "Please install Node.js and npm first."
                    log_info "Visit https://nodejs.org/"
                    exit 1
                fi
                ;;
            *)
                log_error "Unsupported operating system: $os"
                exit 1
                ;;
        esac
    fi

    log_info "Installation method: $install_method"
    echo ""

    # Install based on method
    case "$install_method" in
        npm)
            install_npm
            ;;
        homebrew)
            install_homebrew
            ;;
        binary)
            install_binary "$os" "$arch"
            add_to_path
            ;;
    esac

    echo ""
    verify_installation

    echo ""
    echo -e "${BOLD}Quick Start:${NC}"
    echo "  esm init @myorg/mymodule      # Initialize a new module"
    echo "  esm write @scope/name         # Write module content"
    echo "  esm test @scope/name          # Run module tests"
    echo "  esm run @scope/name           # Execute module script"
    echo ""
    echo "Documentation: https://esm.do/docs"
    echo ""
}

# Run main function with all arguments
main "$@"
