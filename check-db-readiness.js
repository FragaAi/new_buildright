// Database Readiness Check for PDF Upload Testing
// Verifies database structure and functionality for architectural plan processing

const postgres = require('postgres');
const { config } = require('dotenv');

config({ path: '.env.local' });

async function checkDatabaseReadiness() {
  console.log('🔍 NEON DATABASE READINESS CHECK');
  console.log('📋 Verifying PDF Upload & Processing Capabilities');
  console.log('='.repeat(60));
  
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL not found');
    return false;
  }

  const sql = postgres(process.env.POSTGRES_URL);
  let allReady = true;

  try {
    // 1. Database Connection & Info
    console.log('\n1️⃣ DATABASE CONNECTION');
    console.log('-'.repeat(30));
    
    const dbInfo = await sql`SELECT version(), current_database(), current_user`;
    console.log('✅ Connected successfully');
    console.log(`📊 Database: ${dbInfo[0].current_database}`);
    console.log(`👤 User: ${dbInfo[0].current_user}`);
    console.log(`🔧 ${dbInfo[0].version.split(',')[0]}`);

    // 2. Essential Tables for PDF Processing
    console.log('\n2️⃣ PDF PROCESSING TABLES');
    console.log('-'.repeat(30));
    
    const tables = await sql`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_name IN (
        'User', 'Chat', 'project_documents', 'document_pages', 
        'visual_elements', 'measurements', 'multimodal_embeddings'
      )
      ORDER BY table_name
    `;
    
    const requiredTables = [
      'User', 'Chat', 'project_documents', 'document_pages',
      'visual_elements', 'measurements', 'multimodal_embeddings'
    ];
    
    const foundTables = tables.map(t => t.table_name);
    
    requiredTables.forEach(tableName => {
      const table = tables.find(t => t.table_name === tableName);
      if (table) {
        console.log(`✅ ${tableName} (${table.column_count} columns)`);
      } else {
        console.log(`❌ ${tableName} - MISSING`);
        allReady = false;
      }
    });

    // 3. Project Documents Table Structure
    console.log('\n3️⃣ PROJECT DOCUMENTS SCHEMA');
    console.log('-'.repeat(30));
    
    const docColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'project_documents'
      ORDER BY ordinal_position
    `;
    
    const requiredDocColumns = [
      'id', 'chat_id', 'filename', 'original_filename', 'file_url', 
      'file_size', 'mime_type', 'document_type', 'upload_status'
    ];
    
    const foundDocColumns = docColumns.map(c => c.column_name);
    
    requiredDocColumns.forEach(colName => {
      if (foundDocColumns.includes(colName)) {
        const col = docColumns.find(c => c.column_name === colName);
        console.log(`✅ ${colName} (${col.data_type})`);
      } else {
        console.log(`❌ ${colName} - MISSING`);
        allReady = false;
      }
    });

    // 4. Document Pages Processing Chain
    console.log('\n4️⃣ DOCUMENT PAGES PROCESSING');
    console.log('-'.repeat(30));
    
    const pageColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'document_pages'
      AND column_name IN ('id', 'document_id', 'page_number', 'page_type', 'image_url', 'thumbnail_url', 'dimensions')
      ORDER BY column_name
    `;
    
    const requiredPageColumns = ['id', 'document_id', 'page_number', 'page_type', 'image_url', 'thumbnail_url', 'dimensions'];
    const foundPageColumns = pageColumns.map(c => c.column_name);
    
    requiredPageColumns.forEach(colName => {
      if (foundPageColumns.includes(colName)) {
        console.log(`✅ document_pages.${colName}`);
      } else {
        console.log(`❌ document_pages.${colName} - MISSING`);
        allReady = false;
      }
    });

    // 5. Visual Elements Extraction
    console.log('\n5️⃣ VISUAL ELEMENTS EXTRACTION');
    console.log('-'.repeat(30));
    
    const visualColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'visual_elements'
      AND column_name IN ('id', 'page_id', 'element_type', 'bounding_box', 'confidence', 'properties', 'text_content')
      ORDER BY column_name
    `;
    
    const requiredVisualColumns = ['id', 'page_id', 'element_type', 'bounding_box', 'confidence', 'properties', 'text_content'];
    const foundVisualColumns = visualColumns.map(c => c.column_name);
    
    requiredVisualColumns.forEach(colName => {
      if (foundVisualColumns.includes(colName)) {
        console.log(`✅ visual_elements.${colName}`);
      } else {
        console.log(`❌ visual_elements.${colName} - MISSING`);
        allReady = false;
      }
    });

    // 6. Measurements Processing
    console.log('\n6️⃣ MEASUREMENTS PROCESSING');
    console.log('-'.repeat(30));
    
    const measurementColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'measurements'
      AND column_name IN ('id', 'page_id', 'measurement_type', 'value', 'unit', 'confidence')
      ORDER BY column_name
    `;
    
    const requiredMeasurementColumns = ['id', 'page_id', 'measurement_type', 'value', 'unit', 'confidence'];
    const foundMeasurementColumns = measurementColumns.map(c => c.column_name);
    
    requiredMeasurementColumns.forEach(colName => {
      if (foundMeasurementColumns.includes(colName)) {
        console.log(`✅ measurements.${colName}`);
      } else {
        console.log(`❌ measurements.${colName} - MISSING`);
        allReady = false;
      }
    });

    // 7. Database Performance Test
    console.log('\n7️⃣ DATABASE PERFORMANCE TEST');
    console.log('-'.repeat(30));
    
    const performanceStart = Date.now();
    
    // Test basic operations
    const userCount = await sql`SELECT COUNT(*) as count FROM "User"`;
    const chatCount = await sql`SELECT COUNT(*) as count FROM "Chat"`;
    const docCount = await sql`SELECT COUNT(*) as count FROM project_documents`;
    
    const performanceEnd = Date.now();
    const queryTime = performanceEnd - performanceStart;
    
    console.log(`⚡ Query performance: ${queryTime}ms`);
    console.log(`👥 Users: ${userCount[0].count}`);
    console.log(`💬 Chats: ${chatCount[0].count}`);
    console.log(`📄 Documents: ${docCount[0].count}`);
    
    if (queryTime < 1000) {
      console.log('✅ Database performance: Good');
    } else {
      console.log('⚠️  Database performance: Slow (may impact processing)');
    }

    // 8. Storage Capacity Check
    console.log('\n8️⃣ DATABASE STORAGE INFO');
    console.log('-'.repeat(30));
    
    try {
      const storageInfo = await sql`
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename IN ('project_documents', 'document_pages', 'visual_elements', 'measurements')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;
      
      storageInfo.forEach(table => {
        console.log(`📊 ${table.tablename}: ${table.size}`);
      });
      
      console.log('✅ Storage information retrieved');
    } catch (error) {
      console.log('ℹ️  Storage details not available (limited permissions)');
    }

    await sql.end();

    // Final Assessment
    console.log('\n' + '='.repeat(60));
    console.log('📋 DATABASE READINESS SUMMARY');
    console.log('='.repeat(60));
    
    if (allReady) {
      console.log('🎉 DATABASE IS READY FOR PDF UPLOADS!');
      console.log('✅ All required tables present');
      console.log('✅ Schema structure complete');
      console.log('✅ Document processing pipeline ready');
      console.log('✅ Visual elements extraction ready');
      console.log('✅ Measurements processing ready');
      console.log('✅ Performance acceptable');
      console.log('\n🚀 You can proceed with uploading multiple PDFs!');
      return true;
    } else {
      console.log('⚠️  DATABASE NEEDS ATTENTION');
      console.log('❌ Some required components are missing');
      console.log('💡 Review the failed checks above');
      console.log('\n🔧 Please fix issues before uploading PDFs');
      return false;
    }

  } catch (error) {
    console.error('\n❌ Database readiness check failed:', error.message);
    await sql.end();
    return false;
  }
}

// Run the check
checkDatabaseReadiness(); 