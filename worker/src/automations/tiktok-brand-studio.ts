import { createBrandStudioHandler } from '../lib/new-brand-creative';
import { openSlideRenderer, closeSlideRenderer } from '../lib/slide-renderer';
import { uploadMedia, publicMediaUrl } from '../lib/storage';
import { reviewFinalCarousel, visualReviewVersion } from '../lib/creative-visual-review';
import { completeJson } from '../lib/ai';
export const brandStudio=createBrandStudioHandler({openSlideRenderer,closeSlideRenderer,uploadMedia,publicMediaUrl,reviewFinalCarousel,visualReviewVersion,completeJson});
