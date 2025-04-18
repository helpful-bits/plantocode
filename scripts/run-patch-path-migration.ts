import { migratePatchPaths } from '../migrations/patch_path_migration';

async function run() {
    console.log('Running patch path migration script...');
    try {
        const result = await migratePatchPaths();
        if (result.success) {
            console.log('Migration completed successfully:', result.message);
            console.log(`Updated ${result.updated} sessions.`);
        } else {
            console.error('Migration failed:', result.message);
        }
        process.exit(0);
    } catch (error) {
        console.error('Error running migration script:', error);
        process.exit(1);
    }
}

run();



