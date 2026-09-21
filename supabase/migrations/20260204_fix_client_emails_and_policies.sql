
-- Ensure client_emails table exists and has RLS policies
CREATE TABLE IF NOT EXISTS client_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES contactos(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_emails ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable read access for all users') THEN
        CREATE POLICY "Enable read access for all users" ON client_emails FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable insert for all users') THEN
        CREATE POLICY "Enable insert for all users" ON client_emails FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable update for all users') THEN
        CREATE POLICY "Enable update for all users" ON client_emails FOR UPDATE USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_emails' AND policyname = 'Enable delete for all users') THEN
        CREATE POLICY "Enable delete for all users" ON client_emails FOR DELETE USING (true);
    END IF;
END $$;
