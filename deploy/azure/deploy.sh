#!/bin/bash
#
# Azure Functions Deployment Script for esm.do
#
# This script handles the complete deployment process for Azure Functions.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Azure Functions Core Tools installed (npm i -g azure-functions-core-tools@4)
#   - Node.js 18+ installed
#
# Usage:
#   ./deploy.sh                    # Deploy to default resource group
#   ./deploy.sh --create           # Create new Azure resources and deploy
#   ./deploy.sh --resource-group mygroup --app-name myapp
#
# Environment Variables:
#   AZURE_RESOURCE_GROUP  - Azure resource group name (default: esm-do-rg)
#   AZURE_LOCATION        - Azure region (default: eastus)
#   AZURE_APP_NAME        - Function app name (default: esm-do-functions)
#   AZURE_STORAGE_NAME    - Storage account name (default: esmdo + random suffix)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default configuration
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-esm-do-rg}"
LOCATION="${AZURE_LOCATION:-eastus}"
APP_NAME="${AZURE_APP_NAME:-esm-do-functions}"
STORAGE_NAME="${AZURE_STORAGE_NAME:-esmdo$(openssl rand -hex 4)}"
CREATE_RESOURCES=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --create)
      CREATE_RESOURCES=true
      shift
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      shift 2
      ;;
    --storage-name)
      STORAGE_NAME="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./deploy.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --create              Create Azure resources before deployment"
      echo "  --resource-group NAME Azure resource group name"
      echo "  --app-name NAME       Function app name"
      echo "  --location REGION     Azure region (e.g., eastus, westus2)"
      echo "  --storage-name NAME   Storage account name"
      echo "  --help                Show this help message"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}=== esm.do Azure Functions Deployment ===${NC}"
echo ""
echo "Configuration:"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location:       $LOCATION"
echo "  App Name:       $APP_NAME"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v az &> /dev/null; then
  echo -e "${RED}Error: Azure CLI is not installed.${NC}"
  echo "Install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
  exit 1
fi

if ! command -v func &> /dev/null; then
  echo -e "${RED}Error: Azure Functions Core Tools is not installed.${NC}"
  echo "Install it with: npm install -g azure-functions-core-tools@4"
  exit 1
fi

# Check Azure login status
if ! az account show &> /dev/null; then
  echo -e "${YELLOW}Not logged in to Azure. Running 'az login'...${NC}"
  az login
fi

# Display current subscription
SUBSCRIPTION=$(az account show --query name -o tsv)
echo -e "${GREEN}Using Azure subscription: $SUBSCRIPTION${NC}"

# Change to script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Build the parent esm.do package first
echo -e "${YELLOW}Building esm.do package...${NC}"
cd ../..
npm run build
cd "$SCRIPT_DIR"

# Install dependencies
echo -e "${YELLOW}Installing Azure Functions dependencies...${NC}"
npm install

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build

# Create Azure resources if requested
if [ "$CREATE_RESOURCES" = true ]; then
  echo -e "${YELLOW}Creating Azure resources...${NC}"

  # Create resource group
  echo "Creating resource group: $RESOURCE_GROUP"
  az group create \
    --name "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

  # Create storage account
  echo "Creating storage account: $STORAGE_NAME"
  az storage account create \
    --name "$STORAGE_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --output none

  # Create function app
  echo "Creating function app: $APP_NAME"
  az functionapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --storage-account "$STORAGE_NAME" \
    --consumption-plan-location "$LOCATION" \
    --runtime node \
    --runtime-version 20 \
    --functions-version 4 \
    --output none

  # Configure app settings
  echo "Configuring app settings..."
  az functionapp config appsettings set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --settings \
      ESM_DO_ENABLE_UNSAFE_EVAL=true \
      ESM_DO_STORAGE_TYPE=memory \
      NODE_ENV=production \
    --output none

  echo -e "${GREEN}Azure resources created successfully!${NC}"
fi

# Deploy to Azure Functions
echo -e "${YELLOW}Deploying to Azure Functions...${NC}"

func azure functionapp publish "$APP_NAME" --javascript

# Get the function URL
FUNCTION_URL=$(az functionapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query defaultHostName \
  --output tsv)

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Function App URL: https://$FUNCTION_URL"
echo ""
echo "Test endpoints:"
echo "  GET  https://$FUNCTION_URL/math/add           - Module info"
echo "  GET  https://$FUNCTION_URL/math/add.mjs       - ESM module"
echo "  GET  https://$FUNCTION_URL/math/add.d.ts      - TypeScript types"
echo "  POST https://$FUNCTION_URL/math/add/test      - Run tests"
echo "  POST https://$FUNCTION_URL/math/add/run       - Execute script"
echo ""
echo "View logs:"
echo "  func azure functionapp logstream $APP_NAME"
