//go:build darwin

#import <Cocoa/Cocoa.h>

extern void threadnote_tray_click(int action);

@interface ThreadNoteTrayTarget : NSObject
- (void)on_item_click:(NSMenuItem *)sender;
@end

@implementation ThreadNoteTrayTarget
- (void)on_item_click:(NSMenuItem *)sender {
    threadnote_tray_click((int)sender.tag);
}
@end

// Accessed exclusively on the AppKit main thread. Removing the item releases
// its menu; the target stays alive for subsequent create/remove cycles.
static NSStatusItem *threadnote_status_item;
static ThreadNoteTrayTarget *threadnote_tray_target;

void threadnote_set_tray_visible(int visible, const void *icon, int length) {
    NSData *icon_data = visible ? [[NSData alloc] initWithBytes:icon length:length] : nil;
    dispatch_async(dispatch_get_main_queue(), ^{
        @autoreleasepool {
            if (!visible) {
                if (threadnote_status_item) {
                    [[NSStatusBar systemStatusBar] removeStatusItem:threadnote_status_item];
                    [threadnote_status_item release];
                    threadnote_status_item = nil;
                }
                return;
            }
            if (threadnote_status_item) {
                [icon_data release];
                return;
            }
            if (!threadnote_tray_target) {
                threadnote_tray_target = [[ThreadNoteTrayTarget alloc] init];
            }
            threadnote_status_item = [[[NSStatusBar systemStatusBar]
                statusItemWithLength:NSVariableStatusItemLength] retain];
            NSImage *image = [[NSImage alloc] initWithData:icon_data];
            image.template = YES;
            threadnote_status_item.button.image = image;
            threadnote_status_item.button.toolTip = @"ThreadNote";
            [image release];
            [icon_data release];

            NSMenu *menu = [[NSMenu alloc] init];
            menu.autoenablesItems = NO;
            NSArray *labels = @[@"设置", @"退出"];
            for (NSInteger index = 0; index < labels.count; index++) {
                NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:labels[index]
                    action:@selector(on_item_click:) keyEquivalent:@""];
                item.tag = index + 1;
                item.target = threadnote_tray_target;
                [menu addItem:item];
                [item release];
            }
            threadnote_status_item.menu = menu;
            [menu release];
        }
    });
}
