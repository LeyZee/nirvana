// Violation: fans may not depend on conversations (MODULE_DEPENDENCIES).
import { conversationsIndex } from '../../conversations';

export const graphViolation = conversationsIndex;
