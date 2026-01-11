#!/usr/bin/env bash
#
# esm.do CLI Uninstaller
#
# Usage:
#   curl -fsSL https://esm.do/uninstall | bash
#   ./scripts/uninstall.sh
#
# Options:
#   --keep-config   Keep configuration files in ~/.esm
#   --force         Skip confirmation prompt
#

set -euo pipefail

# Configuration
INSTALL_DIR="${ESM_INSTALL_DIR:-$HOME/.esm/bin}"
CONFIG_DIR="$HOME/.esm"
PACKAGE_NAME="esm.do"

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
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

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect installation method
detect_installation() {
    local method=""

    # Check npm global installation
    if command_exists npm; then
        if npm list -g "$PACKAGE_NAME" >/dev/null 2>&1; then
            method="npm"
        fi
    fi

    # Check Homebrew installation
    if command_exists brew; then
        if brew list esm-do >/dev/null 2>&1; then
            if [ -n "$method" ]; then
                method="$method,homebrew"
            else
                method="homebrew"
            fi
        fi
    fi

    # Check binary installation
    if [ -x "$INSTALL_DIR/esm" ]; then
        if [ -n "$method" ]; then
            method="$method,binary"
        else
            method="binary"
        fi
    fi

    echo "$method"
}

# Uninstall via npm
uninstall_npm() {
    log_step "Uninstalling via npm..."

    if npm uninstall -g "$PACKAGE_NAME" 2>/dev/null; then
        log_success "Removed npm package"
    else
        log_warn "npm package not found or already removed"
    fi
}

# Uninstall via Homebrew
uninstall_homebrew() {
    log_step "Uninstalling via Homebrew..."

    if brew uninstall esm-do 2>/dev/null; then
        log_success "Removed Homebrew formula"
    else
        log_warn "Homebrew formula not found or already removed"
    fi

    # Optionally remove tap
    if brew tap | grep -q "dot-do/esm"; then
        log_info "Removing dot-do/esm tap..."
        brew untap dot-do/esm 2>/dev/null || true
    fi
}

# Uninstall binary
uninstall_binary() {
    log_step "Removing binary installation..."

    if [ -x "$INSTALL_DIR/esm" ]; then
        rm -f "$INSTALL_DIR/esm"
        log_success "Removed binary from $INSTALL_DIR"

        # Remove directory if empty
        if [ -d "$INSTALL_DIR" ] && [ -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
            rmdir "$INSTALL_DIR" 2>/dev/null || true
        fi
    else
        log_warn "Binary not found at $INSTALL_DIR"
    fi
}

# Remove configuration
remove_config() {
    log_step "Removing configuration..."

    if [ -d "$CONFIG_DIR" ]; then
        rm -rf "$CONFIG_DIR"
        log_success "Removed configuration directory: $CONFIG_DIR"
    else
        log_info "No configuration directory found"
    fi
}

# Clean PATH modifications
clean_path() {
    log_step "Cleaning PATH modifications..."

    local profile_files=(
        "$HOME/.bashrc"
        "$HOME/.bash_profile"
        "$HOME/.zshrc"
        "$HOME/.profile"
        "$HOME/.config/fish/config.fish"
    )

    local found=false

    for profile_file in "${profile_files[@]}"; do
        if [ -f "$profile_file" ]; then
            if grep -q "esm.do CLI" "$profile_file" 2>/dev/null || grep -q "$INSTALL_DIR" "$profile_file" 2>/dev/null; then
                log_info "Found PATH modification in $profile_file"
                log_warn "Please manually remove the esm.do PATH entry from: $profile_file"
                found=true
            fi
        fi
    done

    if [ "$found" = true ]; then
        echo ""
        log_info "Look for and remove lines like:"
        echo "  # esm.do CLI"
        echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    fi
}

# Print usage
print_usage() {
    cat << EOF
esm.do CLI Uninstaller

Usage:
    ./scripts/uninstall.sh [options]
    curl -fsSL https://esm.do/uninstall | bash

Options:
    --keep-config   Keep configuration files in ~/.esm
    --force         Skip confirmation prompt
    --help          Show this help message

EOF
}

# Main function
main() {
    local keep_config=false
    local force=false

    # Parse arguments
    for arg in "$@"; do
        case "$arg" in
            --keep-config)
                keep_config=true
                ;;
            --force|-f)
                force=true
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

    echo ""
    echo -e "${BOLD}esm.do CLI Uninstaller${NC}"
    echo "========================================"
    echo ""

    # Detect installation
    local installation=$(detect_installation)

    if [ -z "$installation" ]; then
        log_info "esm.do CLI does not appear to be installed"

        if [ -d "$CONFIG_DIR" ] && [ "$keep_config" = false ]; then
            log_info "Found configuration directory: $CONFIG_DIR"
            if [ "$force" = false ]; then
                read -p "Remove configuration directory? [y/N] " -n 1 -r
                echo ""
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    remove_config
                fi
            else
                remove_config
            fi
        fi
        exit 0
    fi

    log_info "Detected installation(s): $installation"
    echo ""

    # Confirmation
    if [ "$force" = false ]; then
        echo -e "${YELLOW}This will remove esm.do CLI from your system.${NC}"
        if [ "$keep_config" = false ]; then
            echo -e "${YELLOW}Configuration in ~/.esm will also be removed.${NC}"
        fi
        echo ""
        read -p "Continue? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Uninstallation cancelled"
            exit 0
        fi
    fi

    echo ""

    # Uninstall based on detected method
    IFS=',' read -ra methods <<< "$installation"
    for method in "${methods[@]}"; do
        case "$method" in
            npm)
                uninstall_npm
                ;;
            homebrew)
                uninstall_homebrew
                ;;
            binary)
                uninstall_binary
                ;;
        esac
    done

    # Remove configuration if not keeping
    if [ "$keep_config" = false ]; then
        remove_config
    else
        log_info "Keeping configuration in $CONFIG_DIR"
    fi

    # Clean PATH
    clean_path

    echo ""
    log_success "esm.do CLI has been uninstalled"

    if command_exists esm 2>/dev/null; then
        log_warn "The 'esm' command may still be available. Please restart your shell."
    fi

    echo ""
}

# Run main function with all arguments
main "$@"
