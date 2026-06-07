export * from './types';
export * from './config';
export * from './image';
export * from './chat';

import {
  generateOpenRouterImage,
  generateImageLikeVolcano,
} from './image';
import {
  createOpenRouterChat,
  createOpenRouterVision,
} from './chat';

export const openRouter = {
  generateImage: generateOpenRouterImage,
  generateImageLikeVolcano,
  createChat: createOpenRouterChat,
  createVision: createOpenRouterVision,
};
