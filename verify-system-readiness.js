// BuildRight System Readiness Verification
// Comprehensive check for architectural plan upload testing

const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: '.env.local' });

async function verifySystemReadiness() {
  console.log('🔍 BUILDRIGHT SYSTEM READINESS VERIFICATION');
  console.log('='.repeat(50));
  
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not found in environment variables');
    return false;
  }

  const sql = postgres(process.env.POSTGRES_URL);
  let allChecks = true;

  try {
    // 1. Database Connection Check
    console.log('\n1️⃣ DATABASE CONNECTION TEST');
    console.log('-'.repeat(30));
    
    const dbInfo = await sql`SELECT version()`;
    console.log('✅ Database connected successfully');
    console.log(`📊 ${dbInfo[0].version.split(',')[0]}`);

    // 2. Core Tables Check
    console.log('\n2️⃣ CORE TABLES VERIFICATION');
    console.log('-'.repeat(30));
    
    const coreTablesCheck = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('User', 'Chat', 'Message_v2', 'project_documents', 'document_pages', 'visual_elements', 'measurements', 'multimodal_embeddings')
      ORDER BY table_name
    `;
    
    const expectedCoreTables = ['User', 'Chat', 'Message_v2', 'project_documents', 'document_pages', 'visual_elements', 'measurements', 'multimodal_embeddings'];
    const foundCoreTables = coreTablesCheck.map(t => t.table_name);
    
    expectedCoreTables.forEach(table => {
      if (foundCoreTables.includes(table)) {
        console.log(`✅ ${table} - exists`);
      } else {
        console.log(`❌ ${table} - missing`);
        allChecks = false;
      }
    });

    // 3. Building Code Tables Check
    console.log('\n3️⃣ BUILDING CODE TABLES VERIFICATION');
    console.log('-'.repeat(30));
    
    const buildingCodeTablesCheck = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('building_codes', 'building_code_versions', 'building_code_sections', 'building_code_embeddings', 'compliance_checks')
      ORDER BY table_name
    `;
    
    const expectedBuildingCodeTables = ['building_codes', 'building_code_versions', 'building_code_sections', 'building_code_embeddings', 'compliance_checks'];
    const foundBuildingCodeTables = buildingCodeTablesCheck.map(t => t.table_name);
    
    expectedBuildingCodeTables.forEach(table => {
      if (foundBuildingCodeTables.includes(table)) {
        console.log(`✅ ${table} - exists`);
      } else {
        console.log(`❌ ${table} - missing`);
        allChecks = false;
      }
    });

    // 4. Data Integrity Check
    console.log('\n4️⃣ DATA INTEGRITY VERIFICATION');
    console.log('-'.repeat(30));
    
    const userCount = await sql`SELECT COUNT(*) FROM "User"`;
    const chatCount = await sql`SELECT COUNT(*) FROM "Chat"`;
    const documentCount = await sql`SELECT COUNT(*) FROM project_documents`;
    
    console.log(`👥 Users: ${userCount[0].count}`);
    console.log(`💬 Chats: ${chatCount[0].count}`);
    console.log(`📄 Documents: ${documentCount[0].count}`);
    
    if (userCount[0].count > 0) {
      console.log('✅ User authentication system ready');
    } else {
      console.log('⚠️  No users found - may need authentication setup');
    }

    // 5. Document Processing Pipeline Check
    console.log('\n5️⃣ DOCUMENT PROCESSING PIPELINE');
    console.log('-'.repeat(30));
    
    // Check if document_pages table has proper structure
    const documentPagesSchema = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'document_pages'
      AND column_name IN ('id', 'document_id', 'page_number', 'page_type', 'image_url', 'thumbnail_url')
      ORDER BY column_name
    `;
    
    const expectedDocumentPageColumns = ['id', 'document_id', 'page_number', 'page_type', 'image_url', 'thumbnail_url'];
    const foundDocumentPageColumns = documentPagesSchema.map(c => c.column_name);
    
    expectedDocumentPageColumns.forEach(column => {
      if (foundDocumentPageColumns.includes(column)) {
        console.log(`✅ document_pages.${column} - exists`);
      } else {
        console.log(`❌ document_pages.${column} - missing`);
        allChecks = false;
      }
    });

    // 6. Visual Elements Processing Check
    console.log('\n6️⃣ VISUAL ELEMENTS PROCESSING');
    console.log('-'.repeat(30));
    
    const visualElementsSchema = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'visual_elements'
      AND column_name IN ('id', 'page_id', 'element_type', 'bounding_box', 'confidence', 'text_content')
      ORDER BY column_name
    `;
    
    const expectedVisualElementColumns = ['id', 'page_id', 'element_type', 'bounding_box', 'confidence', 'text_content'];
    const foundVisualElementColumns = visualElementsSchema.map(c => c.column_name);
    
    expectedVisualElementColumns.forEach(column => {
      if (foundVisualElementColumns.includes(column)) {
        console.log(`✅ visual_elements.${column} - exists`);
      } else {
        console.log(`❌ visual_elements.${column} - missing`);
        allChecks = false;
      }
    });

    // 7. Measurements Processing Check
    console.log('\n7️⃣ MEASUREMENTS PROCESSING');
    console.log('-'.repeat(30));
    
    const measurementsSchema = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'measurements'
      AND column_name IN ('id', 'page_id', 'measurement_type', 'value', 'unit', 'confidence')
      ORDER BY column_name
    `;
    
    const expectedMeasurementColumns = ['id', 'page_id', 'measurement_type', 'value', 'unit', 'confidence'];
    const foundMeasurementColumns = measurementsSchema.map(c => c.column_name);
    
    expectedMeasurementColumns.forEach(column => {
      if (foundMeasurementColumns.includes(column)) {
        console.log(`✅ measurements.${column} - exists`);
      } else {
        console.log(`❌ measurements.${column} - missing`);
        allChecks = false;
      }
    });

    // 8. Environment Variables Check
    console.log('\n8️⃣ ENVIRONMENT CONFIGURATION');
    console.log('-'.repeat(30));
    
    const envVars = {
      'POSTGRES_URL': process.env.POSTGRES_URL,
      'GOOGLE_GENERATIVE_AI_API_KEY': process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      'AUTH_SECRET': process.env.AUTH_SECRET,
      'BLOB_READ_WRITE_TOKEN': process.env.BLOB_READ_WRITE_TOKEN
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        console.log(`✅ ${key} - configured`);
      } else {
        console.log(`❌ ${key} - missing`);
        if (key === 'POSTGRES_URL') allChecks = false;
      }
    });

    await sql.end();

    // Final Assessment
    console.log('\n' + '='.repeat(50));
    console.log('📋 SYSTEM READINESS SUMMARY');
    console.log('='.repeat(50));
    
    if (allChecks) {
      console.log('🎉 SYSTEM READY FOR ARCHITECTURAL PLAN TESTING!');
      console.log('✅ All critical components verified');
      console.log('✅ Database schema complete');
      console.log('✅ Document processing pipeline ready');
      console.log('✅ Visual elements extraction ready');
      console.log('✅ Measurements processing ready');
      return true;
    } else {
      console.log('⚠️  SYSTEM NOT FULLY READY');
      console.log('❌ Some components need attention');
      console.log('💡 Review the failed checks above');
      return false;
    }

  } catch (error) {
    console.error('❌ System verification failed:', error.message);
    await sql.end();
    return false;
  }
}

verifySystemReadiness().then(ready => {
  if (ready) {
    console.log('\n🚀 Ready to proceed with architectural plan upload test!');
  } else {
    console.log('\n🔧 Please address the issues above before testing.');
  }
}); 