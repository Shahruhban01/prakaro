import { env } from 'node:process';

env.NODE_ENV = 'test';
env.AI_VERIFICATION_ENABLED = 'false';
env.PARKING_INTELLIGENCE_DEFAULT_MODE = 'ALL_CANDIDATES';
