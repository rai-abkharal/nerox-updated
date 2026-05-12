import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ImageBackground,
  ActivityIndicator,
  Alert,
  Switch,
  Dimensions,
  Platform
} from 'react-native';
import VpnService from '../services/VpnService';
import PaymentService from '../services/PaymentService';

const { width } = Dimensions.get('window');

export default function Subscription({ navigation }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isYearly, setIsYearly] = useState(false);
  const [activeTab, setActiveTab] = useState('standard'); // 'standard' or 'custom'
  const [planState, setPlanState] = useState(null);
  
  // Custom Plan Config
  const [customDuration, setCustomDuration] = useState('1m');
  const [customDevices, setCustomDevices] = useState(1);
  const [customRegion, setCustomRegion] = useState('Global');
  const [customPrice, setCustomPrice] = useState({ totalPrice: 9.99, monthlyPrice: 9.99 });
  const [calculatingPrice, setCalculatingPrice] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchPlanState();
  }, []);

  const fetchPlanState = async () => {
    try {
      const state = await VpnService.getUserPlanState();
      setPlanState(state);
    } catch (err) {
      console.error('Error fetching plan state:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'custom') {
      updateCustomPrice();
    }
  }, [customDuration, customDevices, activeTab]);

  const updateCustomPrice = async () => {
    try {
      setCalculatingPrice(true);
      
      // Convert duration string to month number for backend
      let durationNum = 1;
      if (customDuration === '1w') durationNum = 0.25;
      else if (customDuration === '3m') durationNum = 3;
      else if (customDuration === '12m') durationNum = 12;
      else durationNum = 1; // '1m'

      const result = await PaymentService.getCustomPrice(durationNum, customDevices);
      if (result) {
        setCustomPrice({
          totalPrice: result.totalPrice,
          monthlyPrice: result.monthlyPrice
        });
      }
    } catch (err) {
      console.error('Error calculating custom price:', err);
    } finally {
      setCalculatingPrice(false);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const data = await PaymentService.getPlans();
      setPlans(data || []);
      
      const freePlan = data.find(p => parseFloat(p.price_usd) === 0);
      if (freePlan) setSelectedPlanId(freePlan.plan_id);
    } catch (err) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    let plan;
    if (activeTab === 'custom') {
      plan = plans.find(p => p.is_custom) || { name: 'Custom Plan', price_usd: customPrice.totalPrice };
    } else {
      plan = plans.find(p => p.plan_id === selectedPlanId);
    }

    if (!plan) return;

    // Free plan — show trial status
    if (parseFloat(plan.price_usd) === 0) {
      if (planState?.is_trial_expired) {
        Alert.alert('Trial Expired', 'Your 7-day free trial has expired. Please select a paid plan to continue using Nerox VPN.');
      } else {
        Alert.alert('Free Plan Active', 'You are already on the Free plan with a 7-day trial active. Select Monthly or Yearly to upgrade to Premium!');
      }
      return;
    }

    try {
      setLoading(true);
      
      let durationNum = null;
      let devicesNum = null;
      let regionStr = null;
      if (activeTab === 'custom') {
        if (customDuration === '1w') durationNum = 0.25;
        else if (customDuration === '3m') durationNum = 3;
        else if (customDuration === '12m') durationNum = 12;
        else durationNum = 1; // '1m'
        devicesNum = customDevices;
        regionStr = customRegion;
      }

      const response = await PaymentService.mockPurchasePlan(plan, durationNum, devicesNum, regionStr);
      Alert.alert(
        '🚀 Upgrade Successful!',
        `You are now on the ${plan.name} plan. Enjoy unlimited access to all Premium features!`,
        [{ text: 'Start Exploring', onPress: () => navigation.navigate('MainScreen') }]
      );
    } catch (err) {
      Alert.alert('Purchase Error', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const currentPlanFeatures = useMemo(() => {
    const plan = plans.find(p => p.plan_id === selectedPlanId);
    if (!plan) return [];
    
    const isFree = parseFloat(plan.price_usd) === 0;
    if (isFree) {
      return [
        { icon: require('../assets/globe.png'), title: '5 Basic Regions', sub: 'Global server network access' },
        { icon: require('../assets/crown.png'), title: '2Mbps Speed Cap', sub: 'High-speed encrypted connection' },
        { icon: require('../assets/crown.png'), title: 'Ads Included', sub: 'Contains ads' },
        { icon: require('../assets/crown.png'), title: 'Standard Security', sub: 'Access geo-restricted content' },
      ];
    }
    return [
      { icon: require('../assets/globe.png'), title: '50+ Global Regions', sub: 'Global server network access' },
      { icon: require('../assets/crown.png'), title: 'Ultra-High Speed', sub: 'High-speed encrypted connection' },
      { icon: require('../assets/crown.png'), title: '100% Ad-Free', sub: '100% ad-free experience' },
      { icon: require('../assets/crown.png'), title: 'Streaming Optimized', sub: 'Access geo-restricted content' },
    ];
  }, [selectedPlanId, plans]);

  return (
    <View style={styles.mainContainer}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Image source={require('../assets/Left.png')} style={styles.backIcon} />
          </Pressable>
          <View style={styles.crownCircle}>
             <Image source={require('../assets/crown.png')} style={styles.crownHeaderIcon} />
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.titleSection}>
           <Text style={styles.title}>Upgrade to Premium Now</Text>
           <Text style={styles.subtitle}>Unlock global servers, ultra speed, and an ad-free experience.</Text>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <Pressable 
            onPress={() => setActiveTab('standard')} 
            style={[styles.tabItem, activeTab === 'standard' && styles.activeTabItem]}
          >
            <Text style={[styles.tabText, activeTab === 'standard' && styles.activeTabText]}>Standard Plans</Text>
          </Pressable>
          <Pressable 
            onPress={() => setActiveTab('custom')} 
            style={[styles.tabItem, activeTab === 'custom' && styles.activeTabItem]}
          >
            <Text style={[styles.tabText, activeTab === 'custom' && styles.activeTabText]}>Custom Plan</Text>
          </Pressable>
        </View>

        {activeTab === 'standard' ? (
          <View style={styles.standardSection}>
            {/* Billing Toggle */}
            <View style={styles.billingToggle}>
              <Text style={[styles.billingOption, !isYearly && styles.activeBilling]}>Monthly</Text>
              <Switch 
                value={isYearly} 
                onValueChange={setIsYearly}
                trackColor={{ false: '#1A2138', true: '#6B8F04' }}
                thumbColor="#fff"
              />
              <Text style={[styles.billingOption, isYearly && styles.activeBilling]}>Yearly (Save 20%)</Text>
            </View>

            {/* Plan Cards */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardScroll}>
              {loading ? (
                <ActivityIndicator size="large" color="#6B8F04" />
              ) : (
                plans
                  .filter(p => !p.is_custom)
                  .filter(p => {
                    // Always show Free and Monthly
                    if (p.name === 'Free' || p.name === 'Monthly') return true;
                    // Show Yearly only if toggle is on
                    if (p.name === 'Yearly') return isYearly;
                    return false;
                  })
                  .sort((a, b) => parseFloat(a.price_usd) - parseFloat(b.price_usd))
                  .map((plan) => (
                    <Pressable
                      key={plan.plan_id}
                      onPress={() => setSelectedPlanId(plan.plan_id)}
                      style={[
                        styles.planCard, 
                        selectedPlanId === plan.plan_id && styles.selectedCard
                      ]}
                    >
                      {selectedPlanId === plan.plan_id && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>SELECTED</Text>
                        </View>
                      )}
                      
                      {/* Active Status Badge */}
                      {((parseFloat(plan.price_usd) === 0 && planState?.plan_type === 'free') || 
                        (parseFloat(plan.price_usd) > 0 && planState?.plan_type === 'premium' && selectedPlanId === plan.plan_id)) && (
                        <View style={[styles.statusBadge, styles.activeBadge]}>
                          <Text style={styles.statusBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                      
                      {/* Expired Trial Badge (Only on Free) */}
                      {parseFloat(plan.price_usd) === 0 && planState?.plan_type !== 'premium' && planState?.is_trial_expired && (
                        <View style={[styles.statusBadge, styles.expiredBadge]}>
                          <Text style={styles.statusBadgeText}>EXPIRED</Text>
                        </View>
                      )}

                      <Text style={styles.cardName}>{plan.name}</Text>
                      <Text style={styles.cardPriceLarge}>
                        {parseFloat(plan.price_usd) === 0 ? 'FREE' : `$${parseFloat(plan.price_usd).toFixed(2)}`}
                      </Text>
                      <Text style={styles.cardSubText}>
                        {parseFloat(plan.price_usd) === 0 ? 'unlimited' : plan.duration_months === 12 ? 'yearly' : 'monthly'}
                      </Text>
                    </Pressable>
                  ))
              )}
            </ScrollView>

            {/* Benefits List */}
            <View style={styles.benefitsList}>
               {currentPlanFeatures.map((f, i) => (
                 <View key={i} style={styles.benefitCard}>
                    <View style={styles.benefitIconBg}>
                       <Image source={f.icon} style={styles.benefitIcon} />
                    </View>
                    <View style={styles.benefitTextContainer}>
                       <Text style={styles.benefitTitle}>{f.title}</Text>
                       <Text style={styles.benefitSub}>{f.sub}</Text>
                    </View>
                 </View>
               ))}
            </View>
          </View>
        ) : (
          <View style={styles.customSection}>
             <View style={styles.builderCard}>
                <Text style={styles.builderMainTitle}>Build Your Custom Plan</Text>
                
                <Text style={styles.builderLabel}>Duration: {customDuration === '1w' ? '1 Week' : customDuration === '1m' ? '1 Month' : customDuration === '3m' ? '3 Months' : '1 Year'}</Text>
                <View style={styles.btnRow}>
                   {['1w', '1m', '3m', '12m'].map(d => (
                     <Pressable key={d} onPress={() => setCustomDuration(d)} style={[styles.selectorBtn, customDuration === d && styles.activeSelector]}>
                        <Text style={[styles.selectorText, customDuration === d && styles.activeSelectorText]}>{d}</Text>
                     </Pressable>
                   ))}
                </View>

                <Text style={styles.builderLabel}>Number of Devices: {customDevices}</Text>
                <View style={styles.btnRow}>
                   {[1, 3, 5, 10].map(v => (
                     <Pressable key={v} onPress={() => setCustomDevices(v)} style={[styles.selectorBtn, customDevices === v && styles.activeSelector]}>
                        <Text style={[styles.selectorText, customDevices === v && styles.activeSelectorText]}>{v}</Text>
                     </Pressable>
                   ))}
                </View>

                <Text style={styles.builderLabel}>Preferred Regions: {customRegion}</Text>
                <View style={styles.btnRow}>
                   {['Global', 'US Only', 'Europe'].map(r => (
                     <Pressable key={r} onPress={() => setCustomRegion(r)} style={[styles.selectorBtn, { flex: 0.31 }, customRegion === r && styles.activeSelector]}>
                        <Text style={[styles.selectorText, customRegion === r && styles.activeSelectorText]}>{r}</Text>
                     </Pressable>
                   ))}
                </View>

                <View style={styles.priceContainer}>
                   <Text style={styles.totalPriceLabel}>Total Price</Text>
                   {calculatingPrice ? (
                     <ActivityIndicator size="small" color="#6B8F04" />
                   ) : (
                     <Text style={styles.totalPriceValue}>${parseFloat(customPrice.totalPrice).toFixed(2)}</Text>
                   )}
                </View>
             </View>

             <View style={styles.benefitsList}>
                <View style={styles.benefitCard}>
                    <View style={styles.benefitIconBg}>
                       <Image source={require('../assets/globe.png')} style={styles.benefitIcon} />
                    </View>
                    <View style={styles.benefitTextContainer}>
                       <Text style={styles.benefitTitle}>All 50+ Locations</Text>
                       <Text style={styles.benefitSub}>Full global network access</Text>
                    </View>
                </View>
                <View style={styles.benefitCard}>
                    <View style={styles.benefitIconBg}>
                       <Image source={require('../assets/crown.png')} style={styles.benefitIcon} />
                    </View>
                    <View style={styles.benefitTextContainer}>
                       <Text style={styles.benefitTitle}>Ultra High Speed</Text>
                       <Text style={styles.benefitSub}>No throttling, pure performance</Text>
                    </View>
                </View>
                <View style={styles.benefitCard}>
                    <View style={styles.benefitIconBg}>
                       <Image source={require('../assets/crown.png')} style={styles.benefitIcon} />
                    </View>
                    <View style={styles.benefitTextContainer}>
                       <Text style={styles.benefitTitle}>Zero Ads</Text>
                       <Text style={styles.benefitSub}>Pure distraction-free privacy</Text>
                    </View>
                </View>
             </View>
          </View>
        )}
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <Pressable 
          onPress={handlePurchase} 
          style={[styles.ctaButton, (selectedPlanId === plans.find(p => p.plan_id === selectedPlanId)?.plan_id && planState?.plan_type === (parseFloat(plans.find(p => p.plan_id === selectedPlanId)?.price_usd) === 0 ? 'free' : 'premium')) && { opacity: 0.7 }]}
        >
          <View style={styles.btnInner}>
             <Text style={styles.ctaText}>
               {((parseFloat(plans.find(p => p.plan_id === selectedPlanId)?.price_usd) === 0 && planState?.plan_type === 'free') || 
                 (parseFloat(plans.find(p => p.plan_id === selectedPlanId)?.price_usd) > 0 && planState?.plan_type === 'premium' && selectedPlanId === plans.find(p => p.plan_id === selectedPlanId)?.plan_id))
                 ? 'Current Plan Active' : 'Upgrade Now'}
             </Text>
          </View>
        </Pressable>
        <Text style={styles.footerSub}>Secure checkout powered by Nerox Pay</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#00091F' },
  scrollContent: { paddingBottom: 150 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#171B2E', justifyContent: 'center', alignItems: 'center' },
  backIcon: { width: 20, height: 20 },
  crownCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(107, 143, 4, 0.2)', justifyContent: 'center', alignItems: 'center' },
  crownHeaderIcon: { width: 24, height: 24, tintColor: '#6B8F04' },
  titleSection: { alignItems: 'center', paddingHorizontal: 20, marginBottom: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { color: '#A1A1AC', fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },
  tabBar: { flexDirection: 'row', backgroundColor: '#171B2E', margin: 20, borderRadius: 15, padding: 5 },
  tabItem: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  activeTabItem: { backgroundColor: '#6B8F04' },
  tabText: { color: '#A1A1AC', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: '#fff' },
  standardSection: { },
  billingToggle: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  billingOption: { color: '#A1A1AC', marginHorizontal: 10, fontSize: 13 },
  activeBilling: { color: '#fff' },
  cardScroll: { paddingLeft: 20, paddingRight: 20, height: 180 },
  planCard: { width: 150, height: 150, backgroundColor: '#171B2E', borderRadius: 20, padding: 20, marginRight: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  selectedCard: { borderColor: '#6B8F04' },
  selectedBadge: { position: 'absolute', top: -10, backgroundColor: '#6B8F04', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 5 },
  selectedBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  cardPriceLarge: { color: '#6B8F04', fontSize: 24, fontWeight: 'bold' },
  cardSubText: { color: '#A1A1AC', fontSize: 12, marginTop: 5 },
  benefitsList: { paddingHorizontal: 20, marginTop: 20 },
  benefitCard: { backgroundColor: '#171B2E', borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  benefitIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' },
  benefitIcon: { width: 20, height: 20, tintColor: '#6B8F04' },
  benefitTextContainer: { marginLeft: 15, flex: 1 },
  benefitTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  benefitSub: { color: '#A1A1AC', fontSize: 12, marginTop: 2 },
  customSection: { paddingHorizontal: 20 },
  builderCard: { backgroundColor: '#171B2E', borderRadius: 25, padding: 20, marginBottom: 10 },
  builderMainTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  builderLabel: { color: '#A1A1AC', fontSize: 13, marginBottom: 10 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  selectorBtn: { flex: 0.23, backgroundColor: '#1F2644', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  activeSelector: { backgroundColor: '#6B8F04' },
  selectorText: { color: '#fff', fontSize: 12 },
  activeSelectorText: { fontWeight: 'bold' },
  priceContainer: { alignItems: 'center', marginTop: 10, paddingVertical: 15, borderTopWidth: 1, borderColor: '#1F2644' },
  totalPriceLabel: { color: '#A1A1AC', fontSize: 12 },
  totalPriceValue: { color: '#6B8F04', fontSize: 36, fontWeight: 'bold', marginTop: 5 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#00091F' },
  ctaButton: { height: 65, width: '100%' },
  btnInner: { flex: 1, backgroundColor: '#6B8F04', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  footerSub: { color: 'rgba(255,255,255,0.3)', fontSize: 10, textAlign: 'center', marginTop: 12 }
});
