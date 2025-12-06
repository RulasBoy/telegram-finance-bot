# Telegram Finance Bot

AI-powered Telegram bot for tracking expenses and income using natural language processing with Claude API and PostgreSQL.

## Features

- 📝 **Natural Language Processing**: Register transactions using plain Spanish text
- 🤖 **AI-Powered**: Uses Claude API to extract transaction details automatically
- ✅ **Smart Validations**: Detects duplicates, suspicious prices, and high amounts
- 💬 **Conversational Context**: Handles corrections and confirmations naturally
- 📊 **Monthly Summaries**: Get expense and income summaries with `/resumen`
- 🗄️ **PostgreSQL Storage**: Reliable data persistence

## Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Anthropic Claude API Key

## Installation

### 1. Clone and Install Dependencies

```bash
cd telegram-finance-bot
npm install
```

### 2. Database Setup

The database user and schema should already be created. If you need to recreate them:

```bash
# Create user and database (as postgres user)
sudo -u postgres psql -c "CREATE USER telegram_bot_user WITH PASSWORD 'telegram_bot_secure_pass_2024';"
sudo -u postgres psql -c "CREATE DATABASE telegram_finance_db OWNER telegram_bot_user;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE telegram_finance_db TO telegram_bot_user;"

# Run migrations
PGPASSWORD=telegram_bot_secure_pass_2024 psql -U telegram_bot_user -d telegram_finance_db -h localhost -f database/migrations/001_initial_schema.sql
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your:
- `TELEGRAM_BOT_TOKEN`: Your bot token from BotFather
- `ANTHROPIC_API_KEY`: Your Claude API key
- `DATABASE_URL`: PostgreSQL connection string (already configured)

### 4. Build and Run

```bash
# Build TypeScript
npm run build

# Run the bot
npm start
```

## Usage

### Commands

- `/start` - Start the bot and see welcome message
- `/help` - Show available commands
- `/resumen` - Get monthly summary of expenses and income

### Registering Transactions

Send messages in natural Spanish:

```
Compré un burrito de 28 pesos
Pagué 500 pesos de luz con tarjeta de crédito
Recibí 5000 pesos de mi trabajo
Gasté 150 en el Uber
```

The bot will:
1. Extract transaction details using Claude AI
2. Validate for duplicates, suspicious prices, or high amounts
3. Ask for confirmation if needed
4. Save the transaction to the database

### Handling Validations

When the bot detects a potential issue, it will ask for confirmation:

- **Duplicates**: "Ya registraste un gasto similar hace X minutos..."
- **Suspicious Price**: "¿Un burrito de $280? ¿Quisiste decir $28?"
- **High Amount**: "Vas a registrar un gasto de $5000... ¿Es correcto?"

Respond with:
- `sí` or `correcto` to confirm
- `no` or `cancelar` to cancel
- `Era 30, no 28` to correct the amount
- `Fue con tarjeta` to add payment method

## Running as a Service (systemd)

To run the bot as a systemd service:

```bash
# Copy service file
sudo cp config/systemd/telegram-finance-bot.service /etc/systemd/system/

# Edit the service file to match your paths and user
sudo nano /etc/systemd/system/telegram-finance-bot.service

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable telegram-finance-bot
sudo systemctl start telegram-finance-bot

# Check status
sudo systemctl status telegram-finance-bot

# View logs
sudo journalctl -u telegram-finance-bot -f
```

## Development

```bash
# Type check
npm run type-check

# Build
npm run build

# Watch mode (development)
npm run dev
```

## Project Structure

```
telegram-finance-bot/
├── src/
│   ├── bot/           # Telegram bot handlers
│   ├── services/      # Claude API and database services
│   ├── models/        # TypeScript types
│   ├── validators/    # Transaction validations
│   ├── utils/         # Logger and conversation utilities
│   └── index.ts       # Entry point
├── database/
│   └── migrations/    # SQL schema migrations
├── config/
│   └── systemd/       # Systemd service configuration
└── dist/              # Compiled JavaScript (generated)
```

## License

MIT License - see LICENSE file for details
