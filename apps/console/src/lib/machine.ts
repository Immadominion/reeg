import type { Machine } from '@reeg/sdk';

/** An environment is shareable when it carries a distinct AccessPolicy object (not its own id and
 *  not the zero address). Used only for a quiet badge, so it errs toward not labelling when unsure. */
export function isShareable(machine: Machine): boolean {
  const policy = machine.policyId;
  return Boolean(policy) && policy !== machine.id && !/^0x0+$/.test(policy);
}
