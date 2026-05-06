# AutoTrader Project Graphs

Here are the visual representations of the `simply-trade` platform you requested.

## Entity-Relationship (ER) Diagram

This diagram shows the core database models and their relationships, representing the foundation we built in Phase 1.

```mermaid
erDiagram
    PORTFOLIO {
        int id PK
        string name
        string mode "live | paper | backtest"
        decimal budget_total
        decimal cash_reserved
        decimal cash_deployed
        string status
    }
    
    SYMBOL {
        int id PK
        string ticker
        string exchange
        string asset_class
        jsonb contract_meta
    }
    
    STRATEGY {
        string code PK
        string name
        jsonb params_schema
        jsonb default_params
    }
    
    ASSIGNMENT ["PORTFOLIO_SYMBOL_STRATEGY"] {
        int id PK
        int portfolio_id FK
        int symbol_id FK
        string strategy_code FK
        jsonb params
        decimal allocation
        boolean enabled
    }
    
    ORDER {
        int id PK
        int portfolio_id FK
        int symbol_id FK
        string strategy_code FK
        string side "BUY | SELL"
        string order_type "MKT | LMT"
        decimal qty
        string status
        string order_ref
    }
    
    FILL {
        int id PK
        int order_id FK
        string ibkr_exec_id
        decimal qty
        decimal price
        decimal commission
    }
    
    VIRTUAL_POSITION {
        int id PK
        int portfolio_id FK
        int symbol_id FK
        decimal qty
        decimal avg_price
        decimal realized_pnl
    }
    
    SIGNAL {
        int id PK
        string strategy_code FK
        int symbol_id FK
        string signal_type
        decimal strength
    }

    PORTFOLIO ||--o{ ASSIGNMENT : "has"
    SYMBOL ||--o{ ASSIGNMENT : "assigned to"
    STRATEGY ||--o{ ASSIGNMENT : "configures"
    
    PORTFOLIO ||--o{ ORDER : "places"
    SYMBOL ||--o{ ORDER : "for"
    STRATEGY ||--o{ ORDER : "generates"
    ORDER ||--o{ FILL : "executed as"
    
    PORTFOLIO ||--o{ VIRTUAL_POSITION : "owns"
    SYMBOL ||--o{ VIRTUAL_POSITION : "represents"
    
    STRATEGY ||--o{ SIGNAL : "emits"
    SYMBOL ||--o{ SIGNAL : "targets"
```

## System Architecture

This diagram shows the Docker orchestration and how the different services interact in the complete platform (Phases 0-9).

```mermaid
architecture-beta
    group platform(cloud)[AutoTrader Platform]

    service frontend(internet)[React/Vite Frontend] in platform
    service api(server)[FastAPI Backend] in platform
    service worker(server)[Celery Execution Engine] in platform
    service bridge(server)[IBKR Bridge] in platform
    
    service db(database)[PostgreSQL 16] in platform
    service cache(database)[Redis] in platform
    
    service gateway(server)[IBKR TWS/Gateway]
    service broker(cloud)[Interactive Brokers]

    frontend:R --> L:api
    
    api:B --> T:db
    api:R --> L:cache
    
    worker:L --> R:cache
    worker:B --> T:db
    
    bridge:L --> R:cache
    bridge:R --> L:gateway
    
    gateway:R --> L:broker
```

## Strategy Execution Flow (Phase 5+)

This sequence diagram illustrates how a strategy executes and interacts with the cash accounting system and IBKR bridge.

```mermaid
sequenceDiagram
    participant S as Strategy Engine
    participant P as Portfolio Service
    participant O as Order Manager
    participant B as IBKR Bridge
    participant IB as IBKR
    
    S->>S: Generate Signal (e.g. BUY AAPL)
    S->>O: Request Order Creation
    O->>P: Check Cash Available
    P-->>O: OK (Reserve Cash)
    O->>O: Create PENDING Order (DB)
    O->>B: Dispatch Order (Redis Pub/Sub)
    B->>IB: Submit Order (orderRef=pf:1:gap_go:live)
    IB-->>B: Acknowledge
    B-->>O: Update Status (SUBMITTED)
    
    Note over B,IB: Time passes... Order executes
    
    IB-->>B: Execution Report (Fill)
    B->>O: Process Fill
    O->>O: Create FILL record (DB)
    O->>P: Update Cash (Release Reserved -> Deployed)
    O->>P: Update Virtual Position
```
