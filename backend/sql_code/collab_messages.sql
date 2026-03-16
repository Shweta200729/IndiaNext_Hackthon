    CREATE TABLE IF NOT EXISTS collab_messages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id UUID NOT NULL REFERENCES collab_sessions(id) ON DELETE CASCADE,
        sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Realtime needs to be enabled for this table so the Frontend auto-updates!
    ALTER PUBLICATION supabase_realtime ADD TABLE collab_messages;
