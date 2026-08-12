const prisma = require("../../../config/prisma");

const CATEGORIES = [
  {
    name: "Smart Glasses",
    slug: "smart-glasses",
    description: "Voice-activated 4K and HD smart recording eyewear for memory capture.",
    image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80",
    order: 1,
  },
  {
    name: "Audio Frames",
    slug: "audio-frames",
    description: "Open-ear directional sound and voice journaling smart glasses.",
    image: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80",
    order: 2,
  },
  {
    name: "Accessories & Charging",
    slug: "accessories",
    description: "Magnetic quick-charge cases, lens cleaning kits, and mounts.",
    image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=80",
    order: 3,
  },
];

const PRODUCTS = [
  {
    id: "odyssey-pro-titanium",
    slug: "pro-titanium-4k",
    name: "Odyssey Pro Titanium 4K",
    tagline: "The Flagship 4K HDR Voice-Activated Smart Recording Glasses",
    badge: "Flagship Edition",
    rating: 4.9,
    reviewsCount: 1248,
    basePrice: 349,
    originalPrice: 429,
    featured: true,
    categorySlug: "smart-glasses",
    description:
      "Crafted from aerospace-grade ultra-lightweight titanium (42g). Experience seamless hands-free 4K HDR video capture, 3D spatial audio recording, and instant AI voice memory sync with SpokenOdyssey vault.",
    features: [
      "Ultra-HD 4K HDR Video @ 60 FPS with Gyro Stabilization",
      "Dual Directional Beamforming Microphones with Wind Noise Reduction",
      "Open-Ear Spatial Audio Speakers with Private Sound Boundary",
      "Privacy LED Indicator Light (Automated On-Air Glow)",
      "Touch Temple Gesture Controls & Voice Command Instant Capture",
      "12-Hour Continuous Battery + Quick-Charge Magnetic Case",
    ],
    specs: {
      videoResolution: "4K Ultra-HD (3840x2160) @ 60fps",
      audio: "Dual Beamforming Mics + Spatial Open-Ear Audio",
      battery: "12 Hours Active Use (Case provides 36 hours total)",
      weight: "42g (Aerospace Titanium Frame)",
      connectivity: "Wi-Fi 6 + Bluetooth 5.3 + Instant Vault Sync",
      waterResistance: "IPX4 Sweat & Weather Resistant",
    },
    images: {
      hero: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80",
      front: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=80",
      side: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1000&q=80",
      lifestyle: "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80",
      angle3D: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=1200&q=80",
    },
    hardwareHotspots: [
      { id: "camera", title: "4K Ultrawide Lens", description: "120° Field of View with hardware optical stabilization and automatic low-light enhancement.", x: 28, y: 35 },
      { id: "microphones", title: "Dual Beam Mics", description: "Studio-grade directional microphones isolate your voice while cancelling ambient wind noise.", x: 48, y: 48 },
      { id: "touch", title: "Touch Temple Sensor", description: "Tap to record, swipe for volume, hold to trigger Instant AI Memory Vault Sync.", x: 72, y: 42 },
      { id: "speaker", title: "Open-Ear Acoustic Chamber", description: "Rich spatial audio delivered directly to your ear canals without blocking external surroundings.", x: 84, y: 55 },
    ],
    variants: [
      { id: "onyx-black", name: "Onyx Black", colorHex: "#111827", colorName: "Onyx Black", badge: "Most Popular", sku: "ODY-PRO-BLK", stock: 150 },
      { id: "obsidian-silver", name: "Obsidian Silver", colorHex: "#9CA3AF", colorName: "Obsidian Silver", badge: "", sku: "ODY-PRO-SLV", stock: 100 },
      { id: "midnight-indigo", name: "Midnight Indigo", colorHex: "#4A3AFF", colorName: "Midnight Indigo", badge: "Exclusive", sku: "ODY-PRO-IND", stock: 80 },
    ],
    options: [
      { type: "storage", name: "64 GB", size: "64 GB", priceAdd: 0, description: "Holds ~10,000 HD Photos / 4 Hours 4K Video", sku: "OPT-STR-64" },
      { type: "storage", name: "128 GB", size: "128 GB", priceAdd: 49, description: "Holds ~25,000 HD Photos / 10 Hours 4K Video", sku: "OPT-STR-128" },
      { type: "storage", name: "256 GB", size: "256 GB", priceAdd: 99, description: "Holds ~60,000 HD Photos / 24 Hours 4K Video", sku: "OPT-STR-256" },
      { type: "lens", name: "Clear Blue-Light Filter", size: "", priceAdd: 0, description: "Everyday Indoor & Screen Protection", sku: "OPT-LNS-BLU" },
      { type: "lens", name: "Polarized Sun UV400", size: "", priceAdd: 29, description: "Outdoor Sun Protection & Anti-Glare", sku: "OPT-LNS-SUN" },
      { type: "lens", name: "Prescription Compatible Mount", size: "", priceAdd: 39, description: "Ready for Optometrist Lenses", sku: "OPT-LNS-RX" },
    ],
  },
  {
    id: "odyssey-sport-polarized",
    slug: "sport-polarized-edition",
    name: "Odyssey Sport Polarized Edition",
    tagline: "Action-Ready HD Recording Glasses for Outdoor Adventures",
    badge: "Active Sport",
    rating: 4.8,
    reviewsCount: 842,
    basePrice: 279,
    originalPrice: 329,
    featured: true,
    categorySlug: "smart-glasses",
    description:
      "Engineered for outdoor athletes, cyclists, and travelers. Features IPX5 water resistance, anti-slip rubberized grips, and polarized UV400 lenses to capture intense outdoor memories.",
    features: [
      "Full HD 1080p Ultra-Smooth Action Video @ 60 FPS",
      "IPX5 Sweat & Water-Splash Resistance",
      "Polarized Shatterproof UV400 Sun Lenses Included",
      "Anti-Slip Ergonomic Rubber Temples for Active Grip",
      "10-Hour High-Capacity Battery Pack",
    ],
    specs: {
      videoResolution: "Full HD (1920x1080) @ 60fps",
      audio: "Wind-Shielded Stereo Microphones",
      battery: "10 Hours Active Outdoor Recording",
      weight: "46g (Impact-Resistant Polymer)",
      connectivity: "Bluetooth 5.3 + Quick Mobile Sync",
      waterResistance: "IPX5 High Water & Sweat Resistance",
    },
    images: {
      hero: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80",
      front: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=80",
      side: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1000&q=80",
      lifestyle: "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80",
      angle3D: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80",
    },
    hardwareHotspots: [
      { id: "camera", title: "Action HD Camera Lens", description: "Wide-angle lens built for high-velocity movement with anti-shake stabilization.", x: 30, y: 36 },
      { id: "grip", title: "Anti-Slip Rubber Grip", description: "Stays locked on your head during running, cycling, and intense outdoor sports.", x: 75, y: 44 },
    ],
    variants: [
      { id: "stealth-matte", name: "Stealth Matte Black", colorHex: "#1F2937", colorName: "Stealth Matte Black", badge: "", sku: "ODY-SPT-BLK", stock: 120 },
      { id: "cyber-amber", name: "Cyber Amber", colorHex: "#D97706", colorName: "Cyber Amber", badge: "", sku: "ODY-SPT-AMB", stock: 80 },
      { id: "alpine-white", name: "Alpine White", colorHex: "#F3F4F6", colorName: "Alpine White", badge: "", sku: "ODY-SPT-WHT", stock: 60 },
    ],
    options: [
      { type: "storage", name: "64 GB", size: "64 GB", priceAdd: 0, description: "Holds ~15,000 HD Action Photos / 8 Hours Video", sku: "OPT-SPT-64" },
      { type: "storage", name: "128 GB", size: "128 GB", priceAdd: 49, description: "Holds ~35,000 HD Action Photos / 20 Hours Video", sku: "OPT-SPT-128" },
      { type: "lens", name: "Polarized Sun UV400", size: "", priceAdd: 0, description: "Included Standard Active Lens", sku: "OPT-SPT-SUN" },
      { type: "lens", name: "Iridium Mirror Lens", size: "", priceAdd: 19, description: "High-Contrast Glare Reduction", sku: "OPT-SPT-MIR" },
    ],
  },
  {
    id: "odyssey-audio-blue-light",
    slug: "audio-blue-light-edition",
    name: "Odyssey Audio & Blue-Light Edition",
    tagline: "All-Day Voice Memory & Open-Ear Acoustic Smart Glasses",
    badge: "Everyday Comfort",
    rating: 4.9,
    reviewsCount: 619,
    basePrice: 219,
    originalPrice: 269,
    featured: true,
    categorySlug: "audio-frames",
    description:
      "Designed for creators, professionals, and daily journalers. Ultra-comfortable lightweight frame featuring open-ear directional audio speakers, clear blue-light filtering lenses, and 14-hour battery life.",
    features: [
      "Open-Ear Acoustic Micro-Drivers with Leak-Proof Sound Guard",
      "Clear Blue-Light Blocking Lenses for Screen Comfort",
      "14-Hour Extended Battery Life for All-Day Wear",
      "Instant Hands-Free Voice Note & Memory Journaling",
      "Lightweight Feather Frame (38g)",
    ],
    specs: {
      videoResolution: "Voice & Audio Capture Optimized",
      audio: "Dual Studio Mics + Directional Micro Drivers",
      battery: "14 Hours Continuous Playback / Standby 48 Hours",
      weight: "38g (Featherweight Acetate)",
      connectivity: "Bluetooth 5.3 + Multi-Device Pairing",
      waterResistance: "IPX4 Weather Resistant",
    },
    images: {
      hero: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80",
      front: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1000&q=80",
      side: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1000&q=80",
      lifestyle: "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=1200&q=80",
      angle3D: "https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&w=1200&q=80",
    },
    hardwareHotspots: [
      { id: "speakers", title: "Leak-Proof Acoustic Speakers", description: "Private sound boundary ensures audio is heard only by you.", x: 80, y: 52 },
      { id: "mics", title: "Clear Voice Microphones", description: "Captures ambient conversations and voice notes for your SpokenOdyssey memory vault.", x: 45, y: 46 },
    ],
    variants: [
      { id: "classic-tortoise", name: "Classic Tortoise", colorHex: "#78350F", colorName: "Classic Tortoise", badge: "", sku: "ODY-AUD-TOR", stock: 90 },
      { id: "space-gray", name: "Space Gray", colorHex: "#4B5563", colorName: "Space Gray", badge: "", sku: "ODY-AUD-GRY", stock: 110 },
    ],
    options: [
      { type: "storage", name: "64 GB", size: "64 GB", priceAdd: 0, description: "Holds 500+ Hours of Voice Memory Audio Recordings", sku: "OPT-AUD-64" },
      { type: "storage", name: "128 GB", size: "128 GB", priceAdd: 39, description: "Holds 1,200+ Hours of Voice Memory Audio Recordings", sku: "OPT-AUD-128" },
      { type: "lens", name: "Clear Blue-Light Filter", size: "", priceAdd: 0, description: "Included Standard Blue-Light Protection", sku: "OPT-AUD-BLU" },
      { type: "lens", name: "Reading Magnifier +1.5", size: "", priceAdd: 19, description: "Magnified Reading Assistant", sku: "OPT-AUD-MAG" },
    ],
  },
];

const COUPONS = [
  {
    code: "ODYSSEY10",
    type: "PERCENTAGE",
    discountValue: 10,
    minOrderAmount: 50,
    perUserLimit: 5,
    maxUses: 10000,
    isActive: true,
  },
  {
    code: "SPOKEN10",
    type: "PERCENTAGE",
    discountValue: 10,
    minOrderAmount: 50,
    perUserLimit: 5,
    maxUses: 10000,
    isActive: true,
  },
  {
    code: "ODYSSEY20",
    type: "PERCENTAGE",
    discountValue: 20,
    minOrderAmount: 100,
    perUserLimit: 2,
    maxUses: 5000,
    isActive: true,
  },
  {
    code: "VIP20",
    type: "PERCENTAGE",
    discountValue: 20,
    minOrderAmount: 100,
    perUserLimit: 2,
    maxUses: 5000,
    isActive: true,
  },
];

async function seedStore() {
  console.log("Seeding Odyssey Store Catalog...");

  // 1. Seed Categories
  const categoryMap = {};
  for (const cat of CATEGORIES) {
    const record = await prisma.storeCategory.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
        image: cat.image,
        order: cat.order,
        isActive: true,
      },
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
        order: cat.order,
        isActive: true,
      },
    });
    categoryMap[cat.slug] = record.id;
    console.log(`✓ Category: ${record.name} (${record.slug})`);
  }

  // 2. Seed Products
  for (const prod of PRODUCTS) {
    const categoryId = categoryMap[prod.categorySlug] || null;

    const productRecord = await prisma.storeProduct.upsert({
      where: { slug: prod.slug },
      update: {
        name: prod.name,
        tagline: prod.tagline,
        badge: prod.badge,
        rating: prod.rating,
        reviewsCount: prod.reviewsCount,
        basePrice: prod.basePrice,
        originalPrice: prod.originalPrice,
        featured: prod.featured,
        description: prod.description,
        features: prod.features,
        specs: prod.specs,
        images: prod.images,
        hardwareHotspots: prod.hardwareHotspots,
        status: "ACTIVE",
        categoryId,
      },
      create: {
        slug: prod.slug,
        name: prod.name,
        tagline: prod.tagline,
        badge: prod.badge,
        rating: prod.rating,
        reviewsCount: prod.reviewsCount,
        basePrice: prod.basePrice,
        originalPrice: prod.originalPrice,
        featured: prod.featured,
        description: prod.description,
        features: prod.features,
        specs: prod.specs,
        images: prod.images,
        hardwareHotspots: prod.hardwareHotspots,
        status: "ACTIVE",
        categoryId,
      },
    });

    console.log(`✓ Product: ${productRecord.name} [${productRecord.slug}]`);

    // Seed Variants
    for (const v of prod.variants) {
      await prisma.storeProductVariant.upsert({
        where: { id: `${productRecord.id}-${v.id}` },
        update: {
          name: v.name,
          colorHex: v.colorHex,
          colorName: v.colorName,
          badge: v.badge || "",
          sku: v.sku,
          stock: v.stock || 100,
          isActive: true,
        },
        create: {
          id: `${productRecord.id}-${v.id}`,
          productId: productRecord.id,
          name: v.name,
          colorHex: v.colorHex,
          colorName: v.colorName,
          badge: v.badge || "",
          sku: v.sku,
          stock: v.stock || 100,
          isActive: true,
        },
      });

      // Seed inventory
      await prisma.storeInventory.upsert({
        where: { sku: v.sku },
        update: {
          quantity: v.stock || 100,
        },
        create: {
          productId: productRecord.id,
          variantId: `${productRecord.id}-${v.id}`,
          sku: v.sku,
          quantity: v.stock || 100,
          reserved: 0,
        },
      });
    }

    // Seed Options (Storage & Lenses)
    for (const opt of prod.options) {
      await prisma.storeProductOption.upsert({
        where: { id: `${productRecord.id}-${opt.sku}` },
        update: {
          name: opt.name,
          type: opt.type,
          size: opt.size || "",
          description: opt.description || "",
          priceAdd: opt.priceAdd || 0,
          sku: opt.sku,
          isActive: true,
        },
        create: {
          id: `${productRecord.id}-${opt.sku}`,
          productId: productRecord.id,
          type: opt.type,
          name: opt.name,
          size: opt.size || "",
          description: opt.description || "",
          priceAdd: opt.priceAdd || 0,
          sku: opt.sku,
          isActive: true,
        },
      });
    }
  }

  // 3. Seed Coupons
  for (const c of COUPONS) {
    await prisma.storeCoupon.upsert({
      where: { code: c.code },
      update: {
        type: c.type,
        discountValue: c.discountValue,
        minOrderAmount: c.minOrderAmount,
        perUserLimit: c.perUserLimit,
        maxUses: c.maxUses,
        isActive: c.isActive,
      },
      create: {
        code: c.code,
        type: c.type,
        discountValue: c.discountValue,
        minOrderAmount: c.minOrderAmount,
        perUserLimit: c.perUserLimit,
        maxUses: c.maxUses,
        isActive: c.isActive,
      },
    });
    console.log(`✓ Coupon: ${c.code} (${c.discountValue}% off)`);
  }

  console.log("Odyssey Store Catalog seeding completed successfully!");
}

if (require.main === module) {
  seedStore()
    .catch((err) => {
      console.error("Store seeding failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedStore };
