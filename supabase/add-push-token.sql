-- Add push_token column to profiles for Expo push notifications
alter table profiles add column if not exists push_token text;
