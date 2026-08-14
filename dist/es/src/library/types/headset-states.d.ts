export interface HeadsetState {
    offHook: boolean;
    muted: boolean;
    held: boolean;
    ringing: boolean;
}
export interface HeadsetStateRecord extends HeadsetState {
    conversationId: string;
    removeTimer?: any;
}
export type UpdateReasons = 'alternativeClient';
