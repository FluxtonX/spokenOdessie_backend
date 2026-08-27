require("dotenv").config();
const prisma = require("./src/config/prisma");
const familyCircleService = require("./src/modules/familyCircle/familyCircle.service");
const assert = require("assert");

async function runVoicePromptsTest() {
  console.log("===================================================================");
  console.log("   STARTING ASK FAMILY VOICE PROMPT & RESPONSE AUTOMATED TEST      ");
  console.log("===================================================================");

  try {
    // 1. Get or create test user & family circle
    const testUser = await prisma.user.upsert({
      where: { email: "voice_tester@spokenodyssey.com" },
      create: {
        email: "voice_tester@spokenodyssey.com",
        displayName: "Voice Tester",
        role: "USER"
      },
      update: {}
    });

    const circle = await familyCircleService.getOrCreateFamilyCircle({ currentUser: testUser });
    console.log(`[PASS] Using Family Circle ID: ${circle.id}`);

    // 2. Create Voice Question Prompt with Base64 Audio Data URL
    const mockAudioBase64 = "data:audio/webm;base64,GkXfo59ChoEBQveBAA==";
    const createdPrompt = await familyCircleService.createFamilyPrompt({
      currentUser: testUser,
      familyCircleId: circle.id,
      question: "Voice Question",
      category: "Heritage",
      audioUrl: mockAudioBase64
    });

    assert(createdPrompt, "Created prompt should exist");
    assert(createdPrompt.audioKey, "Created prompt should have an audioKey");
    assert(createdPrompt.audioUrl, "Created prompt should have a resolved audioUrl");
    console.log("✅ [PASS] Voice Prompt Created:", {
      id: createdPrompt.id,
      question: createdPrompt.question,
      audioKey: createdPrompt.audioKey,
      audioUrl: createdPrompt.audioUrl?.slice(0, 50) + "..."
    });

    // 3. Fetch All Family Prompts for Circle
    const promptsList = await familyCircleService.getFamilyPrompts({
      currentUser: testUser,
      familyCircleId: circle.id
    });

    const fetchedPrompt = promptsList.find(p => p.id === createdPrompt.id);
    assert(fetchedPrompt, "Fetched prompt should exist in list");
    assert(fetchedPrompt.audioUrl, "Fetched prompt MUST have resolved audioUrl");
    assert(fetchedPrompt.audioKey, "Fetched prompt MUST have audioKey");
    console.log("✅ [PASS] Voice Prompt Fetched from DB:", {
      id: fetchedPrompt.id,
      audioUrl: fetchedPrompt.audioUrl?.slice(0, 50) + "...",
      audioKey: fetchedPrompt.audioKey
    });

    // 4. Create Voice Response to Prompt
    const voiceResponse = await familyCircleService.respondToFamilyPrompt({
      currentUser: testUser,
      promptId: createdPrompt.id,
      text: "Voice Answer",
      audioUrl: mockAudioBase64
    });

    assert(voiceResponse, "Voice response should exist");
    assert(voiceResponse.audioKey, "Voice response should have audioKey");
    assert(voiceResponse.audioUrl, "Voice response should have resolved audioUrl");
    console.log("✅ [PASS] Voice Response Created:", {
      id: voiceResponse.id,
      text: voiceResponse.text,
      audioKey: voiceResponse.audioKey,
      audioUrl: voiceResponse.audioUrl?.slice(0, 50) + "..."
    });

    // 5. Clean up test records
    await prisma.familyResponse.deleteMany({ where: { promptId: createdPrompt.id } });
    await prisma.familyPrompt.delete({ where: { id: createdPrompt.id } });
    console.log("✅ [PASS] Test Cleanup Completed");

    console.log("===================================================================");
    console.log("   ASK FAMILY VOICE PROMPT & RESPONSE VERIFICATION COMPLETE: ALL PASSED ");
    console.log("===================================================================");
    process.exit(0);
  } catch (err) {
    console.error("❌ [FAIL] Voice Prompt Test Failed:", err);
    process.exit(1);
  }
}

runVoicePromptsTest();
