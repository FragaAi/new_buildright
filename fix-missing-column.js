// Quick fix for missing building_code_version_id column
const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: '.env.local' });

async function fixMissingColumn() {
  console.log('🔧 Fixing missing building_code_version_id column...');
  
  const sql = postgres(process.env.POSTGRES_URL);
  
  try {
    // Add the missing column
    await sql`
      ALTER TABLE building_code_sections 
      ADD COLUMN IF NOT EXISTS building_code_version_id uuid
    `;
    console.log('✅ Column building_code_version_id added successfully');
    
    // Verify the column exists
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'building_code_sections' 
      AND column_name = 'building_code_version_id'
    `;
    
    if (columns.length > 0) {
      console.log('✅ Column verified - building_code_version_id exists');
    } else {
      console.log('❌ Column still missing');
    }
    
    await sql.end();
    console.log('🎉 Building code column fix completed!');
    
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    await sql.end();
  }
}

fixMissingColumn(); 