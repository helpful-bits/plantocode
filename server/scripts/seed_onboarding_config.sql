-- Seed script for onboarding videos configuration
-- This script inserts the onboarding_videos configuration into the application_configurations table
-- Uses versioned filenames for cache busting (e.g., intro_v1.m3u8)

INSERT INTO application_configurations (
    config_key,
    config_value,
    description,
    created_at,
    updated_at
) VALUES (
    'onboarding_videos',
    jsonb_build_object(
        'intro', 'onboarding/intro_v1.m3u8',
        'workflow', 'onboarding/workflow_v1.m3u8',
        'voice', 'onboarding/voice_v1.m3u8',
        'plan', 'onboarding/plan_v1.m3u8'
    ),
    'Onboarding video manifest with relative S3 keys. Keys map to CloudFront CDN URLs at runtime.',
    NOW(),
    NOW()
)
ON CONFLICT (config_key)
DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();
