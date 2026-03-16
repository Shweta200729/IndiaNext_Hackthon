-- Run this in your Supabase SQL Editor to create the Collaboration Sessions table

CREATE TABLE IF NOT EXISTS collab_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'cancelled', 'completed')),
    shared_version_id INT REFERENCES model_versions(id) ON DELETE SET NULL,
    round_submitted TEXT[], -- ARRAY of user IDs who have submitted their weights
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, recipient_id)
);

-- Realtime needs to be enabled for this table so the Frontend auto-updates!
ALTER PUBLICATION supabase_realtime ADD TABLE collab_sessions;
