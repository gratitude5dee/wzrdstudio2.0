INSERT INTO storage.buckets (id, name, public)
VALUES ('worldview-takes', 'worldview-takes', true)
ON CONFLICT (id) DO NOTHING;