#import "WireGuardTunnel.h"
#import <NetworkExtension/NetworkExtension.h>

@implementation WireGuardTunnel

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(start,
                 startWithConfig:(NSString *)config
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  if (config.length == 0) {
    reject(@"WG_CONFIG_EMPTY", @"WireGuard config is empty", nil);
    return;
  }

  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> *managers, NSError *error) {
    if (error != nil) {
      reject(@"WG_LOAD_FAILED", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject ?: [[NETunnelProviderManager alloc] init];
    NETunnelProviderProtocol *protocol = [[NETunnelProviderProtocol alloc] init];
    NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];
    protocol.providerBundleIdentifier = [NSString stringWithFormat:@"%@.PacketTunnel", bundleId];
    protocol.serverAddress = @"Nerox WireGuard";
    protocol.providerConfiguration = @{
      @"wgQuickConfig": config,
      @"tunnelName": @"nerox"
    };

    manager.protocolConfiguration = protocol;
    manager.localizedDescription = @"Nerox VPN";
    manager.enabled = YES;

    [manager saveToPreferencesWithCompletionHandler:^(NSError *saveError) {
      if (saveError != nil) {
        reject(@"WG_SAVE_FAILED", saveError.localizedDescription, saveError);
        return;
      }

      [manager loadFromPreferencesWithCompletionHandler:^(NSError *reloadError) {
        if (reloadError != nil) {
          reject(@"WG_RELOAD_FAILED", reloadError.localizedDescription, reloadError);
          return;
        }

        NSError *startError = nil;
        BOOL started = [manager.connection startVPNTunnelAndReturnError:&startError];
        if (!started || startError != nil) {
          reject(@"WG_START_FAILED", startError.localizedDescription ?: @"Failed to start iOS VPN tunnel", startError);
          return;
        }

        resolve(@"UP");
      }];
    }];
  }];
}

RCT_REMAP_METHOD(stop,
                 stopWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> *managers, NSError *error) {
    if (error != nil) {
      reject(@"WG_LOAD_FAILED", error.localizedDescription, error);
      return;
    }

    for (NETunnelProviderManager *manager in managers) {
      [manager.connection stopVPNTunnel];
    }

    resolve(@YES);
  }];
}

RCT_REMAP_METHOD(getStatus,
                 getStatusWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  [NETunnelProviderManager loadAllFromPreferencesWithCompletionHandler:^(NSArray<NETunnelProviderManager *> *managers, NSError *error) {
    if (error != nil) {
      reject(@"WG_LOAD_FAILED", error.localizedDescription, error);
      return;
    }

    NETunnelProviderManager *manager = managers.firstObject;
    if (manager == nil) {
      resolve(@"DISCONNECTED");
      return;
    }

    switch (manager.connection.status) {
      case NEVPNStatusConnected:
        resolve(@"UP");
        break;
      case NEVPNStatusConnecting:
        resolve(@"CONNECTING");
        break;
      case NEVPNStatusDisconnecting:
        resolve(@"DISCONNECTING");
        break;
      default:
        resolve(@"DOWN");
        break;
    }
  }];
}

@end