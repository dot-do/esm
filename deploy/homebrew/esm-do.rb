# frozen_string_literal: true

# Homebrew formula for esm.do CLI
# Living ESM modules for AI agents
#
# Installation:
#   brew tap dot-do/esm
#   brew install esm-do
#
# Or install directly:
#   brew install dot-do/esm/esm-do

class EsmDo < Formula
  desc "Living ESM modules for AI agents - types, code, tests, and scripts in one place"
  homepage "https://esm.do"
  license "MIT"

  # Install from npm registry
  url "https://registry.npmjs.org/esm.do/-/esm.do-0.0.1.tgz"
  sha256 "PLACEHOLDER_SHA256"

  # Alternatively, install from GitHub releases:
  # url "https://github.com/dot-do/esm/releases/download/v#{version}/esm-do-#{version}.tar.gz"
  # sha256 "PLACEHOLDER_SHA256"

  livecheck do
    url "https://registry.npmjs.org/esm.do"
    regex(/"version":\s*"([^"]+)"/i)
  end

  depends_on "node" => "18"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      esm.do CLI has been installed!

      Quick start:
        esm init @myorg/mymodule      # Initialize a new module
        esm write @scope/name         # Write module content
        esm test @scope/name          # Run module tests
        esm run @scope/name           # Execute module script

      For more information, visit: https://esm.do

      Configuration is stored in: ~/.esm/config.json
    EOS
  end

  test do
    # Test that the CLI is installed and responds to --version
    assert_match version.to_s, shell_output("#{bin}/esm --version")

    # Test that help works
    assert_match "esm.do - Living ESM modules", shell_output("#{bin}/esm --help")

    # Test that init command exists
    assert_match "Initialize a new ESM module", shell_output("#{bin}/esm help init")
  end
end
