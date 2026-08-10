// Direct database test - skip HTTP, test the service directly with tagged users
// This proves whether the service layer itself works or fails

require("dotenv").config();

async function main() {
  const prisma = require("./src/config/prisma");
  const memoryService = require("./src/modules/memories/memory.service");
  
  // 1. Get users
  const users = await prisma.user.findMany({ take: 5 });
  console.log("=== ALL USERS IN DB ===");
  users.forEach(u => console.log(`  ${u.id} | ${u.email} | ${u.displayName}`));
  
  if (users.length < 2) {
    console.error("Need at least 2 users for tagging test");
    process.exit(1);
  }

  const owner = users[0];
  const taggedUser = users[1];
  
  console.log(`\nOwner:  ${owner.id} (${owner.email})`);
  console.log(`Tagged: ${taggedUser.id} (${taggedUser.email})`);

  // 2. Create memory with tagged users - EXACTLY as controller passes to service
  console.log("\n=== CREATING MEMORY VIA SERVICE ===");
  try {
    const memory = await memoryService.createMemory({
      user: { id: owner.id, email: owner.email, role: "USER" },
      title: "Service Layer Test With Tag",
      description: "Testing tagged user memory via service",
      tags: "test,tagged",
      mood: "happy",
      privacy: "Family",
      type: "Photo",
      status: "published",
      albumId: undefined,
      occurredAt: undefined,
      color: "",
      backgroundId: "",
      fontId: "",
      files: [],  // No actual files
      mediaKey: undefined,
      mediaMimeType: undefined,
      mediaOriginalName: undefined,
      mediaList: undefined,
      taggedUserIds: JSON.stringify([taggedUser.id]),  // Same as FormData sends
    });
    
    console.log("✅ MEMORY CREATED SUCCESSFULLY:");
    console.log(`  id: ${memory.id}`);
    console.log(`  title: ${memory.title}`);
    console.log(`  status: ${memory.status}`);
    console.log(`  privacy: ${memory.privacy}`);
    console.log(`  ownerId: ${memory.ownerId}`);
    console.log(`  taggedUserIds: ${JSON.stringify(memory.taggedUserIds)}`);
    console.log(`  type: ${memory.type}`);
  } catch (err) {
    console.error("❌ SERVICE CREATE FAILED:", err.message);
    console.error("   Status:", err.statusCode);
    console.error("   Stack:", err.stack);
  }
  
  // 3. Now test getMemoriesByUser for the OWNER
  console.log("\n=== FETCHING MEMORIES FOR OWNER ===");
  try {
    const ownerMems = await memoryService.getMemoriesByUser(
      { id: owner.id, email: owner.email },
      null  // No targetUserId means fetch own
    );
    console.log(`Owner has ${ownerMems.length} memories total`);
    ownerMems.slice(0, 5).forEach(m => {
      console.log(`  ${m.id} | "${m.title}" | status=${m.status} | tagged=${JSON.stringify(m.taggedUserIds)}`);
    });
  } catch (err) {
    console.error("❌ FETCH OWNER MEMORIES FAILED:", err.message);
  }
  
  // 4. Now test getMemoriesByUser for the TAGGED USER viewing the owner's profile
  console.log("\n=== FETCHING MEMORIES AS TAGGED USER (viewing owner's profile) ===");
  try {
    const taggedMems = await memoryService.getMemoriesByUser(
      { id: taggedUser.id, email: taggedUser.email },  // currentUser = tagged user
      owner.id  // targetUserId = memory owner
    );
    console.log(`Tagged user sees ${taggedMems.length} memories from owner`);
    taggedMems.slice(0, 5).forEach(m => {
      console.log(`  ${m.id} | "${m.title}" | status=${m.status} | privacy=${m.privacy} | tagged=${JSON.stringify(m.taggedUserIds)}`);
    });
  } catch (err) {
    console.error("❌ FETCH TAGGED USER MEMORIES FAILED:", err.message);
  }

  // 5. Count ALL memories in DB
  const totalCount = await prisma.memory.count();
  const publishedCount = await prisma.memory.count({ where: { status: "published" } });
  const draftCount = await prisma.memory.count({ where: { status: "draft" } });
  console.log(`\n=== DATABASE STATS ===`);
  console.log(`  Total memories: ${totalCount}`);
  console.log(`  Published: ${publishedCount}`);
  console.log(`  Drafts: ${draftCount}`);

  // 6. List the most recent 10 memories
  const recent = await prisma.memory.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, status: true, ownerId: true, taggedUserIds: true, privacy: true, createdAt: true }
  });
  console.log(`\n=== 10 MOST RECENT MEMORIES ===`);
  recent.forEach(m => {
    console.log(`  ${m.createdAt.toISOString()} | ${m.id.substring(0,8)}... | "${m.title}" | status=${m.status} | privacy=${m.privacy} | owner=${m.ownerId.substring(0,8)}... | tagged=${JSON.stringify(m.taggedUserIds)}`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
