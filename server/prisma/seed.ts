import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

function computeInputHash(
  profile: {
    preferredCity: string;
    preferredAreas: string[];
    budgetMin: number;
    budgetMax: number;
    moveInDate: Date | string;
  },
  listing: {
    city: string;
    area: string;
    rent: number;
    availableFrom: Date | string;
    roomType: string;
    furnishing: string;
  }
): string {
  const input = JSON.stringify({
    p: {
      city: profile.preferredCity.toLowerCase().trim(),
      areas: [...profile.preferredAreas].sort().map((a) => a.toLowerCase().trim()),
      min: profile.budgetMin,
      max: profile.budgetMax,
      move: new Date(profile.moveInDate).toISOString().split('T')[0],
    },
    l: {
      city: listing.city.toLowerCase().trim(),
      area: listing.area.toLowerCase().trim(),
      rent: listing.rent,
      from: new Date(listing.availableFrom).toISOString().split('T')[0],
      type: listing.roomType,
      furn: listing.furnishing,
    },
  });

  return crypto.createHash('sha256').update(input).digest('hex');
}

async function main() {
  console.log('🧹 Cleaning database...');
  const tables = [
    'messages',
    'conversations',
    'interests',
    'compatibility_scores',
    'listing_photos',
    'listings',
    'tenant_profiles',
    'refresh_tokens',
    'audit_logs',
    'notifications_outbox',
    'users',
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
  console.log('✨ Database clean.');

  console.log('🔑 Hashing password...');
  const passwordHash = await argon2.hash('password123');

  console.log('👤 Seeding Admin User...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@roomfinder.test',
      name: 'Super Admin',
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('👤 Seeding Owners...');
  const aarav = await prisma.user.create({
    data: { email: 'owner.aarav@roomfinder.test', name: 'Aarav Mehta', passwordHash, role: 'OWNER' },
  });
  const ananya = await prisma.user.create({
    data: { email: 'owner.ananya@roomfinder.test', name: 'Ananya Sharma', passwordHash, role: 'OWNER' },
  });
  const rohan = await prisma.user.create({
    data: { email: 'owner.rohan@roomfinder.test', name: 'Rohan Verma', passwordHash, role: 'OWNER' },
  });
  const isha = await prisma.user.create({
    data: { email: 'owner.isha@roomfinder.test', name: 'Isha Gupta', passwordHash, role: 'OWNER' },
  });
  const kabir = await prisma.user.create({
    data: { email: 'owner.kabir@roomfinder.test', name: 'Kabir Malhotra', passwordHash, role: 'OWNER' },
  });

  console.log('🏠 Seeding Listings...');
  const now = new Date();
  
  const l1 = await prisma.listing.create({
    data: {
      ownerId: aarav.id,
      title: 'Spacious Private Room in Bandra West',
      city: 'Mumbai',
      area: 'Bandra West',
      rent: 25000,
      availableFrom: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      roomType: 'PRIVATE',
      furnishing: 'FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l2 = await prisma.listing.create({
    data: {
      ownerId: aarav.id,
      title: 'Modern 1 BHK Apartment near Link Road',
      city: 'Mumbai',
      area: 'Andheri West',
      rent: 35000,
      availableFrom: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // tomorrow
      roomType: 'ONE_BHK',
      furnishing: 'SEMI_FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l3 = await prisma.listing.create({
    data: {
      ownerId: ananya.id,
      title: 'Cozy Shared Room for Students in Khar',
      city: 'Mumbai',
      area: 'Khar',
      rent: 12000,
      availableFrom: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      roomType: 'SHARED',
      furnishing: 'SEMI_FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l4 = await prisma.listing.create({
    data: {
      ownerId: ananya.id,
      title: 'Premium Studio Apartment in Juhu',
      city: 'Mumbai',
      area: 'Juhu',
      rent: 45000,
      availableFrom: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      roomType: 'STUDIO',
      furnishing: 'FURNISHED',
      status: 'FILLED',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l5 = await prisma.listing.create({
    data: {
      ownerId: rohan.id,
      title: 'Budget Friendly 1 BHK in Powai',
      city: 'Mumbai',
      area: 'Powai',
      rent: 22000,
      availableFrom: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      roomType: 'ONE_BHK',
      furnishing: 'UNFURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l6 = await prisma.listing.create({
    data: {
      ownerId: rohan.id,
      title: 'Luxury 2 BHK with Lake View',
      city: 'Mumbai',
      area: 'Powai',
      rent: 60000,
      availableFrom: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      roomType: 'TWO_BHK',
      furnishing: 'FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l7 = await prisma.listing.create({
    data: {
      ownerId: isha.id,
      title: 'Comfortable Studio near BKC',
      city: 'Mumbai',
      area: 'Kurla',
      rent: 20000,
      availableFrom: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      roomType: 'STUDIO',
      furnishing: 'SEMI_FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l8 = await prisma.listing.create({
    data: {
      ownerId: isha.id,
      title: 'Private Room in Shared Flat',
      city: 'Mumbai',
      area: 'Bandra West',
      rent: 28000,
      availableFrom: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      roomType: 'PRIVATE',
      furnishing: 'FURNISHED',
      status: 'FILLED',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l9 = await prisma.listing.create({
    data: {
      ownerId: kabir.id,
      title: 'Spacious 2 BHK near Metro Station',
      city: 'Mumbai',
      area: 'Andheri East',
      rent: 42000,
      availableFrom: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      roomType: 'TWO_BHK',
      furnishing: 'SEMI_FURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  const l10 = await prisma.listing.create({
    data: {
      ownerId: kabir.id,
      title: 'Shared Room for Professionals in Bandra E',
      city: 'Mumbai',
      area: 'Bandra East',
      rent: 15000,
      availableFrom: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      roomType: 'SHARED',
      furnishing: 'UNFURNISHED',
      status: 'ACTIVE',
      photos: {
        create: [
          { url: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80', position: 0 }
        ]
      }
    }
  });

  console.log('👤 Seeding Tenants and Profiles...');
  const tenantNames = ['Vihaan', 'Sai', 'Aanya', 'Prisha', 'Krishna', 'Aditya', 'Ishaan', 'Diya', 'Arjun', 'Kiara'];
  const tenants: any[] = [];

  for (let i = 0; i < 10; i++) {
    const tenant = await prisma.user.create({
      data: {
        email: `tenant.${i + 1}@roomfinder.test`,
        name: tenantNames[i],
        passwordHash,
        role: 'TENANT'
      }
    });
    tenants.push(tenant);
  }

  // Create profiles for Tenants 1 to 7
  const p1 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[0].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Bandra West', 'Khar'],
      budgetMin: 15000,
      budgetMax: 30000,
      moveInDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      preferences: {}
    }
  });

  const p2 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[1].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Andheri West', 'Powai'],
      budgetMin: 20000,
      budgetMax: 40000,
      moveInDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
      preferences: {}
    }
  });

  const p3 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[2].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Khar', 'Juhu'],
      budgetMin: 25000,
      budgetMax: 50000,
      moveInDate: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000), // 3 weeks from now
      preferences: {}
    }
  });

  const p4 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[3].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Powai', 'Andheri East'],
      budgetMin: 10000,
      budgetMax: 25000,
      moveInDate: now, // today
      preferences: {}
    }
  });

  const p5 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[4].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Bandra West', 'Bandra East'],
      budgetMin: 12000,
      budgetMax: 20000,
      moveInDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 1 month from now
      preferences: {}
    }
  });

  const p6 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[5].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Andheri West', 'Andheri East'],
      budgetMin: 18000,
      budgetMax: 35000,
      moveInDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      preferences: {}
    }
  });

  const p7 = await prisma.tenantProfile.create({
    data: {
      userId: tenants[6].id,
      preferredCity: 'Mumbai',
      preferredAreas: ['Kurla', 'Powai'],
      budgetMin: 15000,
      budgetMax: 22000,
      moveInDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
      preferences: {}
    }
  });

  console.log('📊 Seeding Compatibility Scores...');
  // Score 1: Tenant 1 & Listing 1 (Bandra West)
  await prisma.compatibilityScore.create({
    data: {
      tenantProfileId: p1.id,
      listingId: l1.id,
      score: 88,
      source: 'RULE_BASED',
      explanation: 'Budget fits Bandra West Listing, location is a priority area, available early.',
      inputHash: computeInputHash(p1, l1)
    }
  });

  // Score 2: Tenant 2 & Listing 2 (Andheri West)
  await prisma.compatibilityScore.create({
    data: {
      tenantProfileId: p2.id,
      listingId: l2.id,
      score: 92,
      source: 'RULE_BASED',
      explanation: 'Exceptional match! Budget matches, Bandra West is a priority area, and availability meets move-in parameters.',
      inputHash: computeInputHash(p2, l2)
    }
  });

  // Score 3: Tenant 3 & Listing 3 (Khar)
  await prisma.compatibilityScore.create({
    data: {
      tenantProfileId: p3.id,
      listingId: l3.id,
      score: 85,
      source: 'RULE_BASED',
      explanation: 'Good budget fit, Khar matches preferred areas, available early.',
      inputHash: computeInputHash(p3, l3)
    }
  });

  // Score 4: Tenant 4 & Listing 5 (Powai)
  await prisma.compatibilityScore.create({
    data: {
      tenantProfileId: p4.id,
      listingId: l5.id,
      score: 95,
      source: 'RULE_BASED',
      explanation: 'budget aligns perfectly, Powai location is preferred.',
      inputHash: computeInputHash(p4, l5)
    }
  });

  // Score 5: Tenant 7 & Listing 7 (Kurla)
  await prisma.compatibilityScore.create({
    data: {
      tenantProfileId: p7.id,
      listingId: l7.id,
      score: 78,
      source: 'RULE_BASED',
      explanation: 'Budget is close, Kurla is preferred area, available before move-in date.',
      inputHash: computeInputHash(p7, l7)
    }
  });

  console.log('🤝 Seeding Interests...');
  const interest1 = await prisma.interest.create({
    data: {
      tenantProfileId: p1.id,
      listingId: l1.id,
      status: 'PENDING',
      scoreAtInterest: 88,
    }
  });

  const interest2 = await prisma.interest.create({
    data: {
      tenantProfileId: p2.id,
      listingId: l2.id,
      status: 'ACCEPTED',
      scoreAtInterest: 92,
    }
  });

  const interest3 = await prisma.interest.create({
    data: {
      tenantProfileId: p7.id,
      listingId: l7.id,
      status: 'PENDING',
      scoreAtInterest: 78,
    }
  });

  console.log('💬 Seeding Chat Conversations and Messages...');
  const conversation = await prisma.conversation.create({
    data: {
      interestId: interest2.id,
    }
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: tenants[1].id, // Sai
      body: 'Hi Aarav, I would love to check out the Andheri West room! When are you free?',
      clientMsgId: crypto.randomUUID()
    }
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: aarav.id, // Aarav
      body: 'Hey Sai! I am free this Saturday afternoon. Does 3 PM work for you?',
      clientMsgId: crypto.randomUUID()
    }
  });

  console.log('🏁 Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
