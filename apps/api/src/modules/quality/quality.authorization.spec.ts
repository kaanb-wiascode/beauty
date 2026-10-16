import { REQUIRED_PERMISSION_KEY } from '../../common/auth/permissions.decorator';
import { QualityController } from './quality.controller';

describe('QualityController authorization metadata', () => {
  const permissionFor = (method: keyof QualityController) =>
    Reflect.getMetadata(
      REQUIRED_PERMISSION_KEY,
      QualityController.prototype[method],
    );

  it('requires quality.read for read-only endpoints', () => {
    expect(permissionFor('listFeedback')).toEqual({ resource: 'quality', action: 'read' });
    expect(permissionFor('listCases')).toEqual({ resource: 'quality', action: 'read' });
    expect(permissionFor('getCase')).toEqual({ resource: 'quality', action: 'read' });
  });

  it('requires quality.manage for mutation endpoints', () => {
    expect(permissionFor('createFeedback')).toEqual({ resource: 'quality', action: 'manage' });
    expect(permissionFor('escalate')).toEqual({ resource: 'quality', action: 'manage' });
    expect(permissionFor('createCase')).toEqual({ resource: 'quality', action: 'manage' });
    expect(permissionFor('assign')).toEqual({ resource: 'quality', action: 'manage' });
    expect(permissionFor('transition')).toEqual({ resource: 'quality', action: 'manage' });
  });
});
